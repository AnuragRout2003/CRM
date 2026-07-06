const mongoose = require('mongoose');

const salaryAllocationSchema = new mongoose.Schema(
  {
    attendanceDay: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AttendanceDay',
      required: true,
    },
    dateKey: {
      type: String,
      required: true,
    },
    amount: {
      type: Number,
      required: true,
    },
  },
  { _id: false }
);

const salaryPaymentSchema = new mongoose.Schema(
  {
    employee: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Employee',
      required: true,
      index: true,
    },
    amount: {
      type: Number,
      required: true,
    },
    advanceDeducted: {
      type: Number,
      default: 0,
    },
    grossSettled: {
      type: Number,
      required: true,
    },
    daysPaid: {
      type: Number,
      default: 0,
    },
    paidThroughDate: {
      type: Date,
      default: null,
    },
    carriedForwardSalary: {
      type: Number,
      default: 0,
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
    allocations: {
      type: [salaryAllocationSchema],
      default: [],
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('SalaryPayment', salaryPaymentSchema);
