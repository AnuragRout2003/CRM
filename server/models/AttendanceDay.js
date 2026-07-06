const mongoose = require('mongoose');

const attendanceDaySchema = new mongoose.Schema(
  {
    employee: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Employee',
      required: true,
      index: true,
    },
    employeeName: {
      type: String,
      required: true,
    },
    date: {
      type: Date,
      required: true,
    },
    dateKey: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      enum: ['present', 'absent'],
      required: true,
    },
    wageForThatDay: {
      type: Number,
      default: 0,
    },
    paidAmount: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

attendanceDaySchema.virtual('paidStatus').get(function () {
  if (this.status !== 'present') return 'not_applicable';
  if (this.paidAmount <= 0) return 'unpaid';
  if (this.paidAmount >= this.wageForThatDay) return 'paid';
  return 'partial';
});

attendanceDaySchema.index({ employee: 1, dateKey: 1 }, { unique: true });

attendanceDaySchema.set('toJSON', { virtuals: true });
attendanceDaySchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('AttendanceDay', attendanceDaySchema);
