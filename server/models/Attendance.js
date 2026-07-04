const mongoose = require('mongoose');

/*
  Calendar-map structure:
  attendance: {
    "2026-07": {           ← year-month key
      "01": "present",     ← day: status
      "02": "absent",
      "03": "present",
      ...
    },
    "2026-06": { ... }
  }
*/

const attendanceSchema = new mongoose.Schema(
  {
    employee: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Employee',
      required: true,
    },
    employeeName: {
      type: String,
      required: true,
    },
    // Calendar map: Map<"YYYY-MM", Map<"DD", "present"|"absent">>
    attendance: {
      type: Map,
      of: {
        type: Map,
        of: {
          type: String,
          enum: ['present', 'absent'],
        },
      },
      default: new Map(),
    },
  },
  {
    timestamps: true,
  }
);

// Compound index: one attendance doc per employee
attendanceSchema.index({ employee: 1 }, { unique: true });

module.exports = mongoose.model('Attendance', attendanceSchema);
