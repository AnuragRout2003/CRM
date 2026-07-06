const mongoose = require('mongoose');
const Employee = require('./models/Employee');
require('dotenv').config();

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  const emp = await Employee.findOne({ name: /zdbd/i });
  if (!emp) {
    console.log("Employee zdbd not found");
    process.exit(0);
  }
  
  // 1. Remove the carry-over advances (5000 on Jul 5 and 4500 on Jul 6)
  // We identify them by amount and roughly date.
  emp.advances = emp.advances.filter(a => {
    if (a.amount === 5000 && new Date(a.date).getDate() === 5) return false;
    if (a.amount === 4500 && new Date(a.date).getDate() === 6) return false;
    return true;
  });

  // 2. Add the -500 deduction that happened on Jul 6
  // Get the date of the Jul 6 payment to match it
  const paymentJul6 = emp.payments.find(p => p.amount === 2500 || p.amount === 2000);
  if (paymentJul6) {
    emp.advances.push({
      amount: -500,
      type: 'DEDUCTED',
      date: paymentJul6.date,
      method: 'CASH'
    });
  }
  
  // 3. Set carriedOverUnpaidWages to 31998
  emp.carriedOverUnpaidWages = 31998;
  
  await emp.save();
  console.log("Migration complete. zdbd restored.");
  process.exit(0);
}
run();
