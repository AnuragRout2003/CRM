const mongoose = require('mongoose');
const Employee = require('./models/Employee');
const Attendance = require('./models/Attendance');
require('dotenv').config();

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  const employees = await Employee.find({});
  
  for (let emp of employees) {
    if (!emp.dailyWage || emp.dailyWage <= 0) continue;

    // Convert carriedOverUnpaidWages to backwards offset
    if (emp.carriedOverUnpaidWages > 0 || (emp.lastPaymentDate && !emp.paidTillDate)) {
      // In this migration, we will calculate total days they SHOULD be paid for
      // based on their current "Remaining Salary" from the previous ledger logic!
      
      const att = await Attendance.findOne({ employee: emp._id });
      let presentDates = [];
      if (att && att.attendance) {
        Object.entries(att.attendance).forEach(([month, days]) => {
          if (days && typeof days === 'object') {
            Object.entries(days).forEach(([day, status]) => {
              if (status === 'present') {
                presentDates.push(`${month}-${String(day).padStart(2, '0')}`);
              }
            });
          }
        });
      }
      presentDates.sort();

      // Total earned from all time
      const totalEarned = presentDates.length * emp.dailyWage;
      
      // Total advances balance
      const totalAdvance = emp.advances.reduce((sum, a) => sum + a.amount, 0);
      
      // What we owed them before this migration (under the old system):
      // In the old system, if they had lastPaymentDate, the days before it were ignored.
      // But we had carriedOverUnpaidWages.
      
      let oldWorkingDays = 0;
      let lastPaymentStr = null;
      if (emp.lastPaymentDate) {
         const lp = new Date(emp.lastPaymentDate);
         lastPaymentStr = `${lp.getFullYear()}-${String(lp.getMonth() + 1).padStart(2, '0')}-${String(lp.getDate()).padStart(2, '0')}`;
         oldWorkingDays = presentDates.filter(d => d > lastPaymentStr).length;
      } else {
         oldWorkingDays = presentDates.length;
      }
      
      const oldEarnedThisCycle = oldWorkingDays * emp.dailyWage;
      const oldTotalOwed = oldEarnedThisCycle + (emp.carriedOverUnpaidWages || 0);
      
      // Now, we want the NEW system to owe them EXACTLY `oldTotalOwed`.
      // NEW Owed = (Total Present - Paid Days) * dailyWage.
      // Wait, NEW Owed = (Unpaid Days > paidTillDate) * dailyWage.
      
      // The easiest way is: Total Unpaid Days = oldTotalOwed / emp.dailyWage
      const totalUnpaidDays = oldTotalOwed / emp.dailyWage;
      
      // This means Total Paid Days = presentDates.length - totalUnpaidDays
      const totalPaidDays = presentDates.length - totalUnpaidDays;
      
      if (totalPaidDays <= 0) {
        emp.paidTillDate = null;
        emp.partialPaidDays = Math.max(0, totalPaidDays); // if negative, it means they are owed more than they worked (impossible unless carriedOverUnpaidWages was manually set high)
      } else {
        let daysToMove = totalPaidDays;
        let pDate = null;
        for (const dateStr of presentDates) {
          if (daysToMove >= 1) {
            pDate = new Date(dateStr);
            daysToMove -= 1;
          } else {
            break;
          }
        }
        emp.paidTillDate = pDate;
        emp.partialPaidDays = daysToMove;
      }
      
      // Remove old field
      emp.carriedOverUnpaidWages = undefined;
      
      await emp.save();
      console.log(`Migrated ${emp.name}: Paid Till: ${emp.paidTillDate}, Partial: ${emp.partialPaidDays}`);
    }
  }
  
  console.log("Migration 2 complete.");
  process.exit(0);
}
run();
