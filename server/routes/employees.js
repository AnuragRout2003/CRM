const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const Employee = require('../models/Employee');

// ── Multer config for profile picture uploads ──
const uploadsDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, `profile-${uniqueSuffix}${ext}`);
  },
});

const fileFilter = (req, file, cb) => {
  const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
  if (allowed.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Only JPEG, PNG, WebP, and GIF images are allowed'), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB max
});

// GET all employees
router.get('/', async (req, res) => {
  try {
    const employees = await Employee.find().sort({ createdAt: -1 });
    res.json(employees);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET single employee
router.get('/:id', async (req, res) => {
  try {
    const employee = await Employee.findById(req.params.id);
    if (!employee) return res.status(404).json({ error: 'Employee not found' });
    res.json(employee);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST create employee (with profile picture)
router.post('/', upload.single('profilePicture'), async (req, res) => {
  try {
    const { name, dailyWage } = req.body;

    if (!req.file) {
      return res.status(400).json({ error: 'Profile picture is required' });
    }

    // Check for duplicate name
    const existing = await Employee.findOne({
      name: { $regex: new RegExp(`^${name.trim()}$`, 'i') },
    });
    if (existing) {
      // Delete the uploaded file since we won't use it
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: `Employee "${name}" already exists` });
    }

    const employee = new Employee({
      name: name.trim(),
      dailyWage: parseFloat(dailyWage) || 0,
      profilePicture: req.file.filename,
      payments: [],
      advances: [],
      lastPaymentDate: null,
    });

    await employee.save();
    res.status(201).json(employee);
  } catch (err) {
    // Clean up uploaded file on error
    if (req.file) {
      fs.unlink(req.file.path, () => {});
    }
    if (err.code === 11000) {
      return res.status(400).json({ error: 'An employee with this name already exists' });
    }
    res.status(400).json({ error: err.message });
  }
});

// Helper to preserve insertion order when user picks a date without time
const parseDateWithTime = (dateStr) => {
  if (!dateStr) return new Date();
  const d = new Date(dateStr);
  if (typeof dateStr === 'string' && dateStr.length === 10) { // e.g. "2026-07-03"
    const now = new Date();
    d.setHours(now.getHours(), now.getMinutes(), now.getSeconds(), now.getMilliseconds());
  }
  return d;
};

// POST add salary payment to employee
router.post('/:id/payment', async (req, res) => {
  try {
    const { amount, date, carryOverAdvance, method = 'CASH' } = req.body;
    const paymentDate = parseDateWithTime(date);

    const employee = await Employee.findById(req.params.id);
    if (!employee) return res.status(404).json({ error: 'Employee not found' });

    employee.payments.push({ amount, date: paymentDate, method });
    employee.lastPaymentDate = paymentDate;

    // Handle carry over advance
    if (carryOverAdvance && Number(carryOverAdvance) > 0) {
      // Create a timestamp exactly 1 ms after the payment so it falls in the next cycle
      const carryOverDate = new Date(paymentDate.getTime() + 1);
      // carry over advance adopts the payment method for tracking
      employee.advances.push({ amount: Number(carryOverAdvance), date: carryOverDate, method });
    }

    await employee.save();
    res.json(employee);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST add advance to employee
router.post('/:id/advance', async (req, res) => {
  try {
    const { amount, date, method = 'CASH' } = req.body;
    const advDate = parseDateWithTime(date);

    const employee = await Employee.findById(req.params.id);
    if (!employee) return res.status(404).json({ error: 'Employee not found' });

    employee.advances.push({ amount, date: advDate, method });
    
    await employee.save();
    res.json(employee);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// PUT update employee details (name, dailyWage, optional new profile picture)
router.put('/:id', upload.single('profilePicture'), async (req, res) => {
  try {
    const { name, dailyWage } = req.body;
    const updateData = { name, dailyWage };

    if (req.file) {
      // Delete old profile picture
      const oldEmp = await Employee.findById(req.params.id);
      if (oldEmp?.profilePicture) {
        const oldPath = path.join(uploadsDir, oldEmp.profilePicture);
        fs.unlink(oldPath, () => {});
      }
      updateData.profilePicture = req.file.filename;
    }

    const employee = await Employee.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    );
    if (!employee) return res.status(404).json({ error: 'Employee not found' });
    res.json(employee);
  } catch (err) {
    if (err.code === 11000) {
      return res.status(400).json({ error: 'An employee with this name already exists' });
    }
    res.status(400).json({ error: err.message });
  }
});

// DELETE employee
router.delete('/:id', async (req, res) => {
  try {
    const employee = await Employee.findByIdAndDelete(req.params.id);
    if (!employee) return res.status(404).json({ error: 'Employee not found' });

    // Delete profile picture file
    if (employee.profilePicture) {
      const picPath = path.join(uploadsDir, employee.profilePicture);
      fs.unlink(picPath, () => {});
    }

    // Also delete attendance record
    const Attendance = require('../models/Attendance');
    await Attendance.deleteOne({ employee: req.params.id });
    res.json({ message: 'Employee deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
