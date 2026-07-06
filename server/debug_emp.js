const mongoose = require('mongoose');
const Employee = require('./models/Employee');
const Attendance = require('./models/Attendance');
require('dotenv').config();

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  const emp = await Employee.findOne({ name: /zdbd/i });
  if (!emp) {
    console.log("Employee zdbd not found");
    process.exit(0);
  }
  
  console.log("Employee Data:");
  console.log("Name:", emp.name);
  console.log("Daily Wage:", emp.dailyWage);
  console.log("Last Payment Date:", emp.lastPaymentDate);
  console.log("Advances:");
  emp.advances.forEach(a => console.log(`  - Amount: ${a.amount}, Date: ${a.date}`));
  console.log("Payments:");
  emp.payments.forEach(p => console.log(`  - Amount: ${p.amount}, Date: ${p.date}`));
  
  console.log("\nComputed Advance After Last Payment:", emp.advanceAfterLastPayment);
  
  const att = await Attendance.findOne({ employee: emp._id });
  console.log("\nAttendance Data:");
  if (att && att.attendance) {
    // Only print 'present' days
    Object.entries(att.attendance).forEach(([month, days]) => {
      if (days && typeof days === 'object') {
        Object.entries(days).forEach(([day, status]) => {
           if (status === 'present') {
             console.log(`  Date ${month}-${day}: ${status}`);
           }
        });
      }
    });
  } else {
    console.log("No attendance found");
  }
  
  // Reproduce logic:
  let afterDateStr = null;
  if (emp.lastPaymentDate) {
    const lp = new Date(emp.lastPaymentDate);
    afterDateStr = `${lp.getFullYear()}-${String(lp.getMonth() + 1).padStart(2, '0')}-${String(lp.getDate()).padStart(2, '0')}`;
  }
  
  let count = 0;
  if (att && att.attendance) {
    Object.entries(att.attendance).forEach(([mk, days]) => {
      if (days && typeof days === 'object') {
        Object.entries(days).forEach(([dayStr, status]) => {
          if (status !== 'present') return;
          const fullDateStr = `${mk}-${dayStr}`;
          if (!afterDateStr || fullDateStr > afterDateStr) count++;
        });
      }
    });
  }
  
  console.log("\nComputed workingDaysAfterLastPayment:", count);
  console.log("Computed wagesEarned:", count * emp.dailyWage);
  console.log("Computed remainingSalary:", Math.max(0, (count * emp.dailyWage) - emp.advanceAfterLastPayment));
  
  process.exit(0);
}
run();
