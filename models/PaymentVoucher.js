import mongoose from 'mongoose'

const paymentSchema = new mongoose.Schema({
  voucherNo: { type: String, required: true },
  date: { type: Date },
  customerName: { type: String  },
  amount: { type: String, required:true  },
  carRegNo : { type: String  },
});

const PaymentVehicle = mongoose.model('PaymentSchema', paymentSchema);
export default PaymentVehicle
