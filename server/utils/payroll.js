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

const buildPaidAttendanceMap = (attendanceDays) => {
  const paidAttendance = {};
  attendanceDays.forEach((day) => {
    if ((day.paidAmount || 0) <= 0) return;
    const [year, month, date] = day.dateKey.split('-');
    const monthKey = `${year}-${month}`;
    if (!paidAttendance[monthKey]) paidAttendance[monthKey] = {};
    paidAttendance[monthKey][date] = day.paidAmount;
  });
  return paidAttendance;
};

const migrateLegacyAttendanceForEmployee = async (employeeId) => {
  const employee = await Employee.findById(employeeId);
  if (!employee) return;

  const existingAttendanceCount = await AttendanceDay.countDocuments({ employee: employeeId });

  if (existingAttendanceCount === 0) {
    const legacyRecord = await LegacyAttendance.findOne({ employee: employeeId });
    if (legacyRecord?.attendance) {
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
    }
  }

  if (employee.paidTillDate || employee.partialPaidDays) {
    const hasPaidAttendance = await AttendanceDay.exists({ employee: employee._id, paidAmount: { $gt: 0 } });
    if (hasPaidAttendance) return;

    const paidTillKey = employee.paidTillDate ? toDateKey(employee.paidTillDate) : null;
    const presentDays = await AttendanceDay.find({
      employee: employee._id,
      status: 'present',
    }).sort({ dateKey: 1 });

    const writes = [];
    let partialDaysLeft = employee.partialPaidDays || 0;
    for (const day of presentDays) {
      const wage = day.wageForThatDay || employee.dailyWage || 0;
      if (!wage) continue;

      if (paidTillKey && day.dateKey <= paidTillKey) {
        if ((day.paidAmount || 0) < wage) {
          writes.push({
            updateOne: {
              filter: { _id: day._id },
              update: { $set: { paidAmount: wage } },
            },
          });
        }
        continue;
      }

      if (partialDaysLeft > 0 && (day.paidAmount || 0) <= 0) {
        const paidAmount = Math.min(wage, partialDaysLeft * wage);
        partialDaysLeft -= paidAmount / wage;
        writes.push({
          updateOne: {
            filter: { _id: day._id },
            update: { $set: { paidAmount } },
          },
        });
      }
    }

    if (writes.length) {
      await AttendanceDay.bulkWrite(writes);
    }
  }
};

const migrateLegacyTransactionsForEmployee = async (employee) => {
  const hasLegacyPayments = Array.isArray(employee.payments) && employee.payments.length > 0;
  const hasLegacyAdvances = Array.isArray(employee.advances) && employee.advances.length > 0;
  if (!hasLegacyPayments && !hasLegacyAdvances) return;

  const [paymentCount, advanceCount] = await Promise.all([
    hasLegacyPayments ? SalaryPayment.countDocuments({ employee: employee._id }) : Promise.resolve(1),
    hasLegacyAdvances ? AdvanceTransaction.countDocuments({ employee: employee._id }) : Promise.resolve(1),
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

  let dayIndex = 0;
  const paidByDay = new Map(presentDays.map((day) => [String(day._id), 0]));
  const attendanceWrites = [];
  const paymentWrites = [];

  for (const payment of payments) {
    let amountLeft = payment.grossSettled ?? ((payment.amount || 0) + (payment.advanceDeducted || 0));
    const allocations = [];

    while (amountLeft > 0 && dayIndex < presentDays.length) {
      const day = presentDays[dayIndex];
      const wage = day.wageForThatDay || employee.dailyWage || 0;
      const dayId = String(day._id);
      const currentPaid = paidByDay.get(dayId) || 0;
      const unpaidForDay = Math.max(0, wage - currentPaid);

      if (unpaidForDay <= 0) {
        dayIndex += 1;
        continue;
      }

      const applied = Math.min(amountLeft, unpaidForDay);
      const newPaidAmount = currentPaid + applied;
      paidByDay.set(dayId, newPaidAmount);

      allocations.push({
        attendanceDay: day._id,
        dateKey: day.dateKey,
        amount: applied,
      });

      amountLeft -= applied;
      if (newPaidAmount >= wage) dayIndex += 1;
    }

    const existingAllocations = (payment.allocations || []).map((allocation) => ({
      attendanceDay: String(allocation.attendanceDay),
      dateKey: allocation.dateKey,
      amount: allocation.amount,
    }));
    const nextAllocations = allocations.map((allocation) => ({
      attendanceDay: String(allocation.attendanceDay),
      dateKey: allocation.dateKey,
      amount: allocation.amount,
    }));

    if (JSON.stringify(existingAllocations) !== JSON.stringify(nextAllocations)) {
      paymentWrites.push({
        updateOne: {
          filter: { _id: payment._id },
          update: { $set: { allocations } },
        },
      });
    }
  }

  for (const day of presentDays) {
    const nextPaidAmount = paidByDay.get(String(day._id)) || 0;
    if ((day.paidAmount || 0) !== nextPaidAmount) {
      attendanceWrites.push({
        updateOne: {
          filter: { _id: day._id },
          update: { $set: { paidAmount: nextPaidAmount } },
        },
      });
    }
  }

  await Promise.all([
    attendanceWrites.length ? AttendanceDay.bulkWrite(attendanceWrites) : Promise.resolve(),
    paymentWrites.length ? SalaryPayment.bulkWrite(paymentWrites) : Promise.resolve(),
  ]);
};

const buildAttendanceRecordForEmployee = async (employee) => {
  const days = await getAttendanceDaysForEmployee(employee._id);
  return {
    employee: employee._id,
    employeeName: employee.name,
    attendance: buildAttendanceMap(days),
    paidAttendance: buildPaidAttendanceMap(days),
  };
};

const getAllAttendanceRecords = async () => {
  await migrateAllLegacyAttendance();
  const [employees, days] = await Promise.all([
    Employee.find().sort({ name: 1 }),
    AttendanceDay.find({}).sort({ employee: 1, dateKey: 1 }),
  ]);

  const daysByEmployee = new Map();
  days.forEach((day) => {
    const employeeId = String(day.employee);
    if (!daysByEmployee.has(employeeId)) daysByEmployee.set(employeeId, []);
    daysByEmployee.get(employeeId).push(day);
  });

  return employees.map((employee) => {
    const employeeDays = daysByEmployee.get(String(employee._id)) || [];
    return {
      employee: employee._id,
      employeeName: employee.name,
      attendance: buildAttendanceMap(employeeDays),
      paidAttendance: buildPaidAttendanceMap(employeeDays),
    };
  });
};

const getEmployeePayrollSnapshot = async (employee, { rebuildPaidAmounts = false } = {}) => {
  await Promise.all([
    migrateLegacyTransactionsForEmployee(employee),
    migrateLegacyAttendanceForEmployee(employee._id),
  ]);

  if (rebuildPaidAmounts) {
    await rebuildPaidAmountsForEmployee(employee);
  }

  const [attendanceDays, payments, advanceTransactions] = await Promise.all([
    AttendanceDay.find({ employee: employee._id }).sort({ dateKey: 1 }),
    SalaryPayment.find({ employee: employee._id }).sort({ date: 1, createdAt: 1 }),
    AdvanceTransaction.find({ employee: employee._id }).sort({ date: 1, createdAt: 1 }),
  ]);

  const presentDays = attendanceDays.filter((day) => day.status === 'present');
  const totalEarned = presentDays.reduce((sum, day) => sum + (day.wageForThatDay || employee.dailyWage || 0), 0);
  const salarySettled = payments.reduce(
    (sum, payment) => sum + (payment.grossSettled ?? ((payment.amount || 0) + (payment.advanceDeducted || 0))),
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

const buildEmployeePayload = async (employee, options = {}) => {
  const snapshot = await getEmployeePayrollSnapshot(employee, options);
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

const buildEmployeeDetailPayload = async (employee, options = {}) => {
  const employeePayload = await buildEmployeePayload(employee, options);
  const attendanceRecord = await buildAttendanceRecordForEmployee(employee);

  return {
    employee: employeePayload,
    attendance: attendanceRecord,
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
  buildEmployeeDetailPayload,
};
