const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const Employee = require('../models/Employee');
const Attendance = require('../models/Attendance');
const cloudinary = require('cloudinary').v2;

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
      return res.status(400).json({ error: `Employee "${name}" already exists` });
    }

    // Upload to Cloudinary
    const result = await uploadToCloudinary(req.file.buffer);

    const employee = new Employee({
      name: name.trim(),
      dailyWage: parseFloat(dailyWage) || 0,
      profilePicture: result.secure_url,
      payments: [],
      advances: [],
      lastPaymentDate: null,
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

// POST add salary payment to employee
router.post('/:id/payment', async (req, res) => {
  try {
    const { amount, date, carryOverAdvance, method = 'CASH' } = req.body;
    const paymentDate = parseDateWithTime(date);

    const employee = await Employee.findById(req.params.id);
    if (!employee) return res.status(404).json({ error: 'Employee not found' });

    employee.payments.push({ amount, date: paymentDate, method });
    employee.lastPaymentDate = paymentDate;

    if (carryOverAdvance && Number(carryOverAdvance) > 0) {
      const carryOverDate = new Date(paymentDate.getTime() + 1);
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

// PUT update employee details
router.put('/:id', upload.single('profilePicture'), async (req, res) => {
  try {
    const { name, dailyWage } = req.body;
    const updateData = { name, dailyWage };
    
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

    // Delete from Cloudinary
    if (employee.profilePicture) {
      await deleteFromCloudinary(employee.profilePicture);
    }

    await Attendance.deleteOne({ employee: req.params.id });
    res.json({ message: 'Employee deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
