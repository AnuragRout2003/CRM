const mongoose = require('mongoose');

const advanceTransactionSchema = new mongoose.Schema(
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
    type: {
      type: String,
      enum: ['GIVEN', 'DEDUCTED'],
      default: 'GIVEN',
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
    note: {
      type: String,
      default: '',
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('AdvanceTransaction', advanceTransactionSchema);
