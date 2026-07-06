const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const Employee = require('../models/Employee');
const cloudinary = require('cloudinary').v2;
const {
  AttendanceDay,
  SalaryPayment,
  AdvanceTransaction,
  buildEmployeePayload,
  buildEmployeeDetailPayload,
  getEmployeePayrollSnapshot,
} = require('../utils/payroll');

// ── Cloudinary config ──
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Helper to upload buffer to Cloudinary
const uploadToCloudinary = (buffer) => {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      { folder: 'rout_plumbing_profiles' },
      (error, result) => {
        if (error) return reject(error);
        resolve(result);
      }
    );
    uploadStream.end(buffer);
  });
};

// Helper to delete from Cloudinary based on secure_url
const deleteFromCloudinary = async (url) => {
  if (!url || !url.includes('cloudinary.com')) return;
  try {
    const parts = url.split('/');
    const fileWithExt = parts[parts.length - 1];
    const folder = parts[parts.length - 2];
    const publicId = fileWithExt.split('.')[0];
    
    if (folder === 'rout_plumbing_profiles') {
      await cloudinary.uploader.destroy(`${folder}/${publicId}`);
    }
  } catch (err) {
    console.error('Failed to delete image from Cloudinary:', err);
  }
};

// ── Multer config (Memory Storage) ──
const storage = multer.memoryStorage();

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
    const payload = await Promise.all(employees.map((employee) => buildEmployeePayload(employee)));
    res.json(payload);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET single employee
router.get('/:id', async (req, res) => {
  try {
    const employee = await Employee.findById(req.params.id);
    if (!employee) return res.status(404).json({ error: 'Employee not found' });
    res.json(await buildEmployeePayload(employee));
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
      return res.status(400).json({ error: `Employee "${name}" already exists` });
    }

    // Upload to Cloudinary
    const result = await uploadToCloudinary(req.file.buffer);
    const parsedDailyWage = parseDailyWage(dailyWage);

    const employee = new Employee({
      name: name.trim(),
      dailyWage: parsedDailyWage,
      profilePicture: result.secure_url,
    });

    await employee.save();
    res.status(201).json(employee);
  } catch (err) {
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
  if (typeof dateStr === 'string' && dateStr.length === 10) { 
    const now = new Date();
    d.setHours(now.getHours(), now.getMinutes(), now.getSeconds(), now.getMilliseconds());
  }
  return d;
};

const parseDailyWage = (value) => {
  const wage = Math.round(Number(value));
  if (!Number.isFinite(wage) || wage <= 0) {
    throw new Error('Daily wage must be a positive whole number');
  }
  return wage;
};

const allocateSalaryToPresentDays = async (employee, grossSettled) => {
  let amountLeft = grossSettled;
  const allocations = [];
  const writes = [];
  let daysPaid = 0;
  let paidThroughDate = null;

  const presentDays = await AttendanceDay.find({
    employee: employee._id,
    status: 'present',
  }).sort({ dateKey: 1 });

  for (const day of presentDays) {
    if (amountLeft <= 0) break;

    const wage = day.wageForThatDay || employee.dailyWage || 0;
    const alreadyPaid = day.paidAmount || 0;
    const unpaidForDay = Math.max(0, wage - alreadyPaid);
    if (unpaidForDay <= 0) continue;

    const applied = Math.min(amountLeft, unpaidForDay);
    const nextPaidAmount = alreadyPaid + applied;
    writes.push({
      updateOne: {
        filter: { _id: day._id },
        update: { $set: { paidAmount: nextPaidAmount } },
      },
    });

    allocations.push({
      attendanceDay: day._id,
      dateKey: day.dateKey,
      amount: applied,
    });

    daysPaid += wage > 0 ? applied / wage : 0;
    if (nextPaidAmount >= wage) {
      paidThroughDate = day.date;
    }

    amountLeft -= applied;
  }

  if (writes.length) {
    await AttendanceDay.bulkWrite(writes);
  }

  return {
    allocations,
    daysPaid,
    paidThroughDate,
  };
};

// POST add salary payment to employee
router.post('/:id/payment', async (req, res) => {
  try {
    const { amount, date, advanceDeducted, method = 'CASH' } = req.body;
    const paymentDate = parseDateWithTime(date);

    const employee = await Employee.findById(req.params.id);
    if (!employee) return res.status(404).json({ error: 'Employee not found' });

    const deduction = Number(advanceDeducted) || 0;
    const paymentAmount = Number(amount) || 0;
    const requestedSettled = paymentAmount + deduction;

    if (paymentAmount < 0 || deduction < 0) {
      return res.status(400).json({ error: 'Payment and deduction amounts cannot be negative' });
    }

    if (requestedSettled <= 0) {
      return res.status(400).json({ error: 'Enter a payment amount or advance deduction' });
    }

    const beforePaymentSnapshot = await getEmployeePayrollSnapshot(employee);
    if (deduction > beforePaymentSnapshot.totalAdvance) {
      return res.status(400).json({ error: 'Advance deduction cannot exceed advance balance' });
    }

    const maxCashPayment = Math.max(0, beforePaymentSnapshot.remainingSalary - Math.min(beforePaymentSnapshot.remainingSalary, deduction));
    if (paymentAmount > maxCashPayment) {
      return res.status(400).json({ error: 'Payment amount cannot exceed remaining salary after advance deduction' });
    }

    const grossSettled = Math.min(beforePaymentSnapshot.remainingSalary, requestedSettled);
    if (deduction > 0) {
      await AdvanceTransaction.create({
        employee: employee._id,
        amount: deduction,
        date: paymentDate,
        method: method,
        type: 'DEDUCTED'
      });
    }

    const allocationResult = await allocateSalaryToPresentDays(employee, grossSettled);
    const carriedForwardSalary = Math.max(0, beforePaymentSnapshot.remainingSalary - grossSettled);

    await SalaryPayment.create({
      employee: employee._id,
      amount: paymentAmount,
      advanceDeducted: deduction,
      grossSettled,
      daysPaid: allocationResult.daysPaid,
      paidThroughDate: allocationResult.paidThroughDate,
      carriedForwardSalary,
      date: paymentDate,
      method,
      allocations: allocationResult.allocations,
    });

    res.json(await buildEmployeeDetailPayload(employee));
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

    await AdvanceTransaction.create({
      employee: employee._id,
      amount: Math.abs(Number(amount) || 0),
      date: advDate,
      method,
      type: 'GIVEN',
    });

    res.json(await buildEmployeeDetailPayload(employee));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// PUT update employee details
router.put('/:id', upload.single('profilePicture'), async (req, res) => {
  try {
    const { name, dailyWage } = req.body;
    const updateData = { name, dailyWage: parseDailyWage(dailyWage) };
    
    const oldEmp = await Employee.findById(req.params.id);
    if (!oldEmp) return res.status(404).json({ error: 'Employee not found' });

    if (req.file) {
      // Upload new to Cloudinary
      const result = await uploadToCloudinary(req.file.buffer);
      updateData.profilePicture = result.secure_url;
      
      // Delete old from Cloudinary
      if (oldEmp.profilePicture) {
        await deleteFromCloudinary(oldEmp.profilePicture);
      }
    }

    const employee = await Employee.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    );
    res.json(await buildEmployeeDetailPayload(employee, { rebuildPaidAmounts: true }));
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

    // Delete from Cloudinary
    if (employee.profilePicture) {
      await deleteFromCloudinary(employee.profilePicture);
    }

    await Promise.all([
      AttendanceDay.deleteMany({ employee: req.params.id }),
      SalaryPayment.deleteMany({ employee: req.params.id }),
      AdvanceTransaction.deleteMany({ employee: req.params.id }),
    ]);
    res.json({ message: 'Employee deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
