import mongoose from 'mongoose';

// OwnerDetails Schema
const ownerDetailsSchema = new mongoose.Schema({
  ownerCode: { type: Number, required: true, unique: true },
  totalVehicles: { type: Number },
  regDate: { type: Date, required: true },
  ownerName: { type: String, required: true },
  fatherName: { type: String },
  cinc: { type: String, required: true, unique: true }, // Assuming CNIC should be unique
  address: { type: String },
  city: { type: String },
  mobileNo: { type: String },
  phone: { type: String },
  profession: { type: String },
  selectedRegistration: { type: String, required: true },
  carType: { type: String },
  carModel: { type: String },
  carMake: { type: String },
  profilePhotoUrl: { type: String }
}, { timestamps: true });

const OwnerDetails = mongoose.model('OwnerDetails', ownerDetailsSchema);

export default OwnerDetails;
