import mongoose from 'mongoose';

// RentReceipt Schema
const rentReceiptSchema = new mongoose.Schema({
  rentReceiptId: { type: String },
  regDate: { type: Date, required: true },
  serialNo: { type: Number, required: true, unique: true },
  customerInfo: {
    customerName: { type: String },
    cinc: { type: String },
    address: { type: String },
    city: { type: String },
    DrivingLicense: { type: String },
    mobileNo: { type: String },
    phone: { type: String },
    referenceName: { type: String },
    referenceMobile: { type: String },
  },
  vehicleInfo: {
    registrationNo: { type: String },
    carType: { type: String },
    carMake: { type: String },
    carModel: { type: String },
    transmissionType: { type: String },
    engineCapacity: { type: String },
    chassisNo: { type: String },
    engineNo: { type: String },
  },
  features: {
    airConditioner: { type: Boolean, default: false },
    heater: { type: Boolean, default: false },
    sunRoof: { type: Boolean, default: false },
    cdDVD: { type: Boolean, default: false },
    andriod: { type: Boolean, default: false },
    frontCamera: { type: Boolean, default: false },
    rearCamera: { type: Boolean, default: false },
    cigarette: { type: Boolean, default: false },
    sterring: { type: Boolean, default: false },
    wheelCup: { type: Boolean, default: false },
    spareWheel: { type: Boolean, default: false },
    airCompressor: { type: Boolean, default: false },
    jackHandle: { type: Boolean, default: false },
    wheelPanna: { type: Boolean, default: false },
    mudFlaps: { type: Boolean, default: false },
    floorMat: { type: Boolean, default: false },
    withDriver: { type: Boolean, default: false },
    selfDriver: { type: Boolean, default: false },
  },
  rentInfo: {
    rentTypes: { type: String, },
  },
  rentalInfo: {
    dateFrom: { type: Date },
    cityFrom: { type: String },
    dateTo: { type: Date },
    cityTo: { type: String },
    totalDays: { type: Number, default: 0 },
    meterReading: { type: String },
    vehicleOutDate: { type: Date },
    vehicleOutTime: { type: String },
    totalAmount: { type: Number },
    advanceAmount: { type: Number },
    balanceAmount: { type: Number },
  },
  isBooked: {
    type: Boolean,
    default: false,
  },
}, { timestamps: true });

const RentReceipt = mongoose.model('RentReceipt', rentReceiptSchema);

export default RentReceipt;
