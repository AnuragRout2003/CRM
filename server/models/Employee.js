const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
  amount: {
    type: Number,
    required: true,
  },
  date: {
    type: Date,
    required: true,
    default: Date.now,
  },
  method: {
    type: String,
    enum: ['CASH', 'UPI'],
    default: 'CASH',
  },
});

const advanceSchema = new mongoose.Schema({
  amount: {
    type: Number,
    required: true,
  },
  date: {
    type: Date,
    required: true,
    default: Date.now,
  },
  method: {
    type: String,
    enum: ['CASH', 'UPI'],
    default: 'CASH',
  },
});

const employeeSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Employee name is required'],
      trim: true,
    },
    profilePicture: {
      type: String,
      required: [true, 'Profile picture is required'],
      default: null,
    },
    dailyWage: {
      type: Number,
      required: [true, 'Daily wage is required'],
      default: 0,
    },
    payments: {
      type: [paymentSchema],
      default: [],
    },
    advances: {
      type: [advanceSchema],
      default: [],
    },
    lastPaymentDate: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Virtual: total of all payments
employeeSchema.virtual('totalPayment').get(function () {
  return this.payments.reduce((sum, p) => sum + p.amount, 0);
});

// Virtual: total of all advances
employeeSchema.virtual('totalAdvance').get(function () {
  return this.advances.reduce((sum, a) => sum + a.amount, 0);
});

// Virtual: advances after last payment
employeeSchema.virtual('advanceAfterLastPayment').get(function () {
  if (!this.lastPaymentDate) {
    return this.advances.reduce((sum, a) => sum + a.amount, 0);
  }
  return this.advances
    .filter((a) => new Date(a.date) > new Date(this.lastPaymentDate))
    .reduce((sum, a) => sum + a.amount, 0);
});

// Unique index on name (case-insensitive)
employeeSchema.index({ name: 1 }, { unique: true, collation: { locale: 'en', strength: 2 } });

employeeSchema.set('toJSON', { virtuals: true });
employeeSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Employee', employeeSchema);
