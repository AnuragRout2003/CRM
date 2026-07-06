const Employee = require('../models/Employee');
const LegacyAttendance = require('../models/Attendance');
const AttendanceDay = require('../models/AttendanceDay');
const SalaryPayment = require('../models/SalaryPayment');
const AdvanceTransaction = require('../models/AdvanceTransaction');

const toDateKey = (date) => {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const dateFromKey = (dateKey) => new Date(`${dateKey}T00:00:00`);

const readDayEntries = (days) => {
  if (!days) return [];
  return days instanceof Map ? [...days.entries()] : Object.entries(days);
};

const buildAttendanceMap = (attendanceDays) => {
  const attendance = {};
  attendanceDays.forEach((day) => {
    const [year, month, date] = day.dateKey.split('-');
    const monthKey = `${year}-${month}`;
    if (!attendance[monthKey]) attendance[monthKey] = {};
    attendance[monthKey][date] = day.status;
  });
  return attendance;
};

const migrateLegacyAttendanceForEmployee = async (employeeId) => {
  const employee = await Employee.findById(employeeId);
  if (!employee) return;

  const legacyRecord = await LegacyAttendance.findOne({ employee: employeeId });
  if (!legacyRecord?.attendance) return;

  const writes = [];
  legacyRecord.attendance.forEach((days, monthKey) => {
    readDayEntries(days).forEach(([day, status]) => {
      if (!['present', 'absent'].includes(status)) return;
      const dateKey = `${monthKey}-${String(day).padStart(2, '0')}`;
      writes.push({
        updateOne: {
          filter: { employee: employee._id, dateKey },
          update: {
            $setOnInsert: {
              employee: employee._id,
              employeeName: employee.name,
              date: dateFromKey(dateKey),
              dateKey,
              status,
              wageForThatDay: employee.dailyWage || 0,
              paidAmount: 0,
            },
          },
          upsert: true,
        },
      });
    });
  });

  if (writes.length) {
    await AttendanceDay.bulkWrite(writes);
  }

  if (employee.paidTillDate || employee.partialPaidDays) {
    const paidTillKey = employee.paidTillDate ? toDateKey(employee.paidTillDate) : null;
    const presentDays = await AttendanceDay.find({
      employee: employee._id,
      status: 'present',
    }).sort({ dateKey: 1 });

    let partialDaysLeft = employee.partialPaidDays || 0;
    for (const day of presentDays) {
      const wage = day.wageForThatDay || employee.dailyWage || 0;
      if (!wage) continue;

      if (paidTillKey && day.dateKey <= paidTillKey) {
        if ((day.paidAmount || 0) < wage) {
          day.paidAmount = wage;
          await day.save();
        }
        continue;
      }

      if (partialDaysLeft > 0 && (day.paidAmount || 0) <= 0) {
        const paidAmount = Math.min(wage, partialDaysLeft * wage);
        day.paidAmount = paidAmount;
        partialDaysLeft -= paidAmount / wage;
        await day.save();
      }
    }
  }
};

const migrateLegacyTransactionsForEmployee = async (employee) => {
  const [paymentCount, advanceCount] = await Promise.all([
    SalaryPayment.countDocuments({ employee: employee._id }),
    AdvanceTransaction.countDocuments({ employee: employee._id }),
  ]);

  if (paymentCount === 0 && employee.payments?.length) {
    await SalaryPayment.insertMany(
      employee.payments.map((payment) => ({
        employee: employee._id,
        amount: payment.amount || 0,
        advanceDeducted: 0,
        grossSettled: payment.amount || 0,
        daysPaid: payment.daysPaid || 0,
        paidThroughDate: payment.paidThroughDate || employee.paidTillDate || null,
        carriedForwardSalary: payment.carriedForwardSalary || 0,
        date: payment.date,
        method: payment.method || 'CASH',
        allocations: [],
      }))
    );
  }

  if (advanceCount === 0 && employee.advances?.length) {
    await AdvanceTransaction.insertMany(
      employee.advances.map((advance) => {
        const amount = Number(advance.amount) || 0;
        return {
          employee: employee._id,
          amount: Math.abs(amount),
          type: advance.type === 'DEDUCTED' || amount < 0 ? 'DEDUCTED' : 'GIVEN',
          date: advance.date,
          method: advance.method || 'CASH',
        };
      })
    );
  }
};

const migrateAllLegacyAttendance = async () => {
  const legacyRecords = await LegacyAttendance.find().select('employee');
  await Promise.all(legacyRecords.map((record) => migrateLegacyAttendanceForEmployee(record.employee)));
};

const getAttendanceDaysForEmployee = async (employeeId) => {
  await migrateLegacyAttendanceForEmployee(employeeId);
  return AttendanceDay.find({ employee: employeeId }).sort({ dateKey: 1 });
};

const rebuildPaidAmountsForEmployee = async (employee) => {
  const presentDays = await AttendanceDay.find({
    employee: employee._id,
    status: 'present',
  }).sort({ dateKey: 1 });
  const payments = await SalaryPayment.find({ employee: employee._id }).sort({ date: 1, createdAt: 1 });

  for (const day of presentDays) {
    if ((day.paidAmount || 0) !== 0) {
      day.paidAmount = 0;
      await day.save();
    }
  }

  let dayIndex = 0;
  for (const payment of payments) {
    let amountLeft = payment.amount || 0;
    const allocations = [];

    while (amountLeft > 0 && dayIndex < presentDays.length) {
      const day = presentDays[dayIndex];
      const wage = day.wageForThatDay || employee.dailyWage || 0;
      const unpaidForDay = Math.max(0, wage - (day.paidAmount || 0));

      if (unpaidForDay <= 0) {
        dayIndex += 1;
        continue;
      }

      const applied = Math.min(amountLeft, unpaidForDay);
      day.paidAmount = (day.paidAmount || 0) + applied;
      await day.save();

      allocations.push({
        attendanceDay: day._id,
        dateKey: day.dateKey,
        amount: applied,
      });

      amountLeft -= applied;
      if (day.paidAmount >= wage) dayIndex += 1;
    }

    if (JSON.stringify(payment.allocations || []) !== JSON.stringify(allocations)) {
      payment.allocations = allocations;
      await payment.save();
    }
  }
};

const buildAttendanceRecordForEmployee = async (employee) => {
  const days = await getAttendanceDaysForEmployee(employee._id);
  return {
    employee: employee._id,
    employeeName: employee.name,
    attendance: buildAttendanceMap(days),
  };
};

const getAllAttendanceRecords = async () => {
  await migrateAllLegacyAttendance();
  const employees = await Employee.find().sort({ name: 1 });
  return Promise.all(employees.map((employee) => buildAttendanceRecordForEmployee(employee)));
};

const getEmployeePayrollSnapshot = async (employee) => {
  await migrateLegacyTransactionsForEmployee(employee);
  await getAttendanceDaysForEmployee(employee._id);
  await rebuildPaidAmountsForEmployee(employee);
  const attendanceDays = await AttendanceDay.find({ employee: employee._id }).sort({ dateKey: 1 });
  const payments = await SalaryPayment.find({ employee: employee._id }).sort({ date: 1, createdAt: 1 });
  const advanceTransactions = await AdvanceTransaction.find({ employee: employee._id }).sort({ date: 1, createdAt: 1 });

  const presentDays = attendanceDays.filter((day) => day.status === 'present');
  const totalEarned = presentDays.reduce((sum, day) => sum + (day.wageForThatDay || employee.dailyWage || 0), 0);
  const salarySettled = payments.reduce(
    (sum, payment) => sum + (payment.amount || 0),
    0
  );
  const remainingSalary = Math.max(0, totalEarned - salarySettled);

  const fullyPaidPresentDays = presentDays.filter((day) => (day.paidAmount || 0) >= (day.wageForThatDay || employee.dailyWage || 0));
  const paidTillDate = fullyPaidPresentDays.length
    ? fullyPaidPresentDays[fullyPaidPresentDays.length - 1].date
    : null;
  const partialPaidDays = presentDays.reduce((sum, day) => {
    const wage = day.wageForThatDay || employee.dailyWage || 0;
    if (!wage || (day.paidAmount || 0) <= 0 || (day.paidAmount || 0) >= wage) return sum;
    return sum + (day.paidAmount || 0) / wage;
  }, 0);

  const advances = advanceTransactions.map((tx) => ({
    _id: tx._id,
    amount: tx.type === 'DEDUCTED' ? -Math.abs(tx.amount) : Math.abs(tx.amount),
    date: tx.date,
    method: tx.method,
    type: tx.type,
    note: tx.note,
  }));

  const totalAdvance = advances.reduce((sum, tx) => sum + tx.amount, 0);

  return {
    payments,
    advances,
    totalPayment: payments.reduce((sum, payment) => sum + (payment.amount || 0), 0),
    totalAdvance,
    paidTillDate,
    partialPaidDays,
    remainingSalary,
  };
};

const buildEmployeePayload = async (employee) => {
  const snapshot = await getEmployeePayrollSnapshot(employee);
  const plainEmployee = employee.toObject({ virtuals: false });
  return {
    ...plainEmployee,
    payments: snapshot.payments,
    advances: snapshot.advances,
    totalPayment: snapshot.totalPayment,
    totalAdvance: snapshot.totalAdvance,
    paidTillDate: snapshot.paidTillDate,
    partialPaidDays: snapshot.partialPaidDays,
    remainingSalary: snapshot.remainingSalary,
  };
};

module.exports = {
  AttendanceDay,
  SalaryPayment,
  AdvanceTransaction,
  toDateKey,
  dateFromKey,
  buildAttendanceMap,
  buildAttendanceRecordForEmployee,
  getAllAttendanceRecords,
  getAttendanceDaysForEmployee,
  rebuildPaidAmountsForEmployee,
  getEmployeePayrollSnapshot,
  buildEmployeePayload,
};
