const express = require('express');
const router = express.Router();
const Employee = require('../models/Employee');
const {
  AttendanceDay,
  toDateKey,
  dateFromKey,
  buildAttendanceRecordForEmployee,
  getAllAttendanceRecords,
  getAttendanceDaysForEmployee,
  rebuildPaidAmountsForEmployee,
} = require('../utils/payroll');

const isDateMarkable = (dateKey) => {
  const inputDate = dateFromKey(dateKey);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const sevenDaysAgo = new Date(today);
  sevenDaysAgo.setDate(today.getDate() - 7);
  return inputDate >= sevenDaysAgo && inputDate <= today;
};

// GET all attendance records, grouped into the legacy calendar-map shape.
router.get('/', async (req, res) => {
  try {
    const records = await getAllAttendanceRecords();
    res.json(records);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET attendance for a specific employee, grouped into the legacy calendar-map shape.
router.get('/employee/:employeeId', async (req, res) => {
  try {
    const employee = await Employee.findById(req.params.employeeId);
    if (!employee) return res.status(404).json({ error: 'Employee not found' });

    const record = await buildAttendanceRecordForEmployee(employee);
    res.json(record);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT mark attendance for a specific date.
// Body: { date: "2026-07-02", status: "present" | "absent" | "unmarked" }
router.put('/employee/:employeeId/mark', async (req, res) => {
  try {
    const { date, status } = req.body;

    if (!date || !status) {
      return res.status(400).json({ error: 'date and status are required' });
    }

    if (!['present', 'absent', 'unmarked'].includes(status)) {
      return res.status(400).json({ error: 'status must be "present", "absent", or "unmarked"' });
    }

    const dateKey = toDateKey(`${date}T00:00:00`);
    if (!isDateMarkable(dateKey)) {
      return res.status(400).json({ error: 'Cannot modify attendance outside the last 7 days through today.' });
    }

    const employee = await Employee.findById(req.params.employeeId);
    if (!employee) return res.status(404).json({ error: 'Employee not found' });

    const existing = await AttendanceDay.findOne({ employee: employee._id, dateKey });
    if ((existing?.paidAmount || 0) > 0) {
      return res.status(400).json({ error: 'Cannot modify attendance for a paid date.' });
    }

    if (status === 'unmarked') {
      await AttendanceDay.deleteOne({ employee: employee._id, dateKey });
    } else {
      const paidAmount = status === 'present' ? existing?.paidAmount || 0 : 0;
      await AttendanceDay.findOneAndUpdate(
        { employee: employee._id, dateKey },
        {
          employee: employee._id,
          employeeName: employee.name,
          date: dateFromKey(dateKey),
          dateKey,
          status,
          wageForThatDay: existing?.wageForThatDay || employee.dailyWage || 0,
          paidAmount,
        },
        { upsert: true, new: true, runValidators: true }
      );
    }

    await rebuildPaidAmountsForEmployee(employee);
    const record = await buildAttendanceRecordForEmployee(employee);
    res.json(record);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// GET attendance summary for an employee for a specific month.
router.get('/employee/:employeeId/summary/:month', async (req, res) => {
  try {
    const days = await getAttendanceDaysForEmployee(req.params.employeeId);
    const monthDays = days.filter((day) => day.dateKey.startsWith(req.params.month));
    let present = 0;
    let absent = 0;

    monthDays.forEach((day) => {
      if (day.status === 'present') present++;
      else if (day.status === 'absent') absent++;
    });

    res.json({
      present,
      absent,
      total: present + absent,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
