import mongoose from 'mongoose'

const expenseSchema = new mongoose.Schema({
  voucherNo: { type: String, required: true },
  date: { type: Date },
  head: { type: String, required:true  },
  amount: { type: String, required:true },
  description : { type: String  },
});

const ExpenseVehicle = mongoose.model('ExpenseSchema', expenseSchema);
export default ExpenseVehicle
