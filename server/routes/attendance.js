const express = require('express');
const router = express.Router();
const Attendance = require('../models/Attendance');
const Employee = require('../models/Employee');

// GET all attendance records
router.get('/', async (req, res) => {
  try {
    const records = await Attendance.find().sort({ employeeName: 1 });
    res.json(records);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET attendance for a specific employee
router.get('/employee/:employeeId', async (req, res) => {
  try {
    let record = await Attendance.findOne({ employee: req.params.employeeId });

    // Auto-create attendance doc if it doesn't exist
    if (!record) {
      const employee = await Employee.findById(req.params.employeeId);
      if (!employee) return res.status(404).json({ error: 'Employee not found' });

      record = new Attendance({
        employee: employee._id,
        employeeName: employee.name,
        attendance: new Map(),
      });
      await record.save();
    }

    res.json(record);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT mark attendance for a specific date
// Body: { date: "2026-07-02", status: "present" | "absent" }
router.put('/employee/:employeeId/mark', async (req, res) => {
  try {
    const { date, status } = req.body;

    if (!date || !status) {
      return res.status(400).json({ error: 'date and status are required' });
    }

    if (!['present', 'absent', 'unmarked'].includes(status)) {
      return res.status(400).json({ error: 'status must be "present", "absent", or "unmarked"' });
    }

    const inputDate = new Date(date);
    const now = new Date();
    const sevenDaysAgo = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7);
    const sevenDaysFuture = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 7);
    
    if (inputDate < sevenDaysAgo || inputDate > sevenDaysFuture) {
      return res.status(400).json({ error: 'Cannot modify attendance outside the 7-day window.' });
    }

    const [year, month, day] = date.split('-');
    const monthKey = `${year}-${month}`; // e.g. "2026-07"
    const dayKey = day;                  // e.g. "02"

    let record = await Attendance.findOne({ employee: req.params.employeeId });

    // Auto-create if not exists
    if (!record) {
      const employee = await Employee.findById(req.params.employeeId);
      if (!employee) return res.status(404).json({ error: 'Employee not found' });

      record = new Attendance({
        employee: employee._id,
        employeeName: employee.name,
        attendance: new Map(),
      });
    }

    // Ensure the month map exists
    if (!record.attendance.has(monthKey)) {
      record.attendance.set(monthKey, new Map());
    }

    // Set the day status or remove if unmarked
    if (status === 'unmarked') {
      record.attendance.get(monthKey).delete(dayKey);
    } else {
      record.attendance.get(monthKey).set(dayKey, status);
    }
    record.markModified('attendance');

    await record.save();
    res.json(record);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// PUT bulk mark attendance for a month
// Body: { month: "2026-07", days: { "01": "present", "02": "absent", ... } }
router.put('/employee/:employeeId/bulk', async (req, res) => {
  try {
    const { month, days } = req.body;

    if (!month || !days) {
      return res.status(400).json({ error: 'month and days are required' });
    }

    let record = await Attendance.findOne({ employee: req.params.employeeId });

    if (!record) {
      const employee = await Employee.findById(req.params.employeeId);
      if (!employee) return res.status(404).json({ error: 'Employee not found' });

      record = new Attendance({
        employee: employee._id,
        employeeName: employee.name,
        attendance: new Map(),
      });
    }

    // Set the entire month map
    const monthMap = new Map(Object.entries(days));
    record.attendance.set(month, monthMap);
    record.markModified('attendance');

    await record.save();
    res.json(record);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// GET attendance summary for an employee for a specific month
router.get('/employee/:employeeId/summary/:month', async (req, res) => {
  try {
    const record = await Attendance.findOne({ employee: req.params.employeeId });

    if (!record) {
      return res.json({ present: 0, absent: 0, unmarked: 0, total: 0 });
    }

    const monthData = record.attendance.get(req.params.month);
    if (!monthData) {
      return res.json({ present: 0, absent: 0, unmarked: 0, total: 0 });
    }

    let present = 0;
    let absent = 0;
    for (const [, status] of monthData) {
      if (status === 'present') present++;
      else if (status === 'absent') absent++;
    }

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
