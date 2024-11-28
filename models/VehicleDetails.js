import mongoose from 'mongoose'

const vehicleSchema = new mongoose.Schema({
  registrationNo: { type: String, required: true },
  registeredCity: { type: String, required: true },
  carType: { type: String },
  carMake: { type: String },
  carModel: { type: String },
  color: { type: String },
  transmissionType: { type: String },
  engineCapacity: { type: String },
  chassisNo: { type: String,  },
  engineNo: { type: String,  },
  fuelType: { type: String, required: true },
  fuelTankCapacity: { type: Number },
  maxSpeed: { type: Number },
  seatingCapacity: { type: Number },
  inspectionDate: { type: Date },
  inspectionMileage: { type: String },
  location: { type: String },
  airConditioner: { type: Boolean },
  heater: { type: Boolean },
  sunRoof: { type: Boolean },
  cdDVD: { type: Boolean },
  android: { type: Boolean },
  frontCamera: { type: Boolean },
  rearCamera: { type: Boolean },
  cigarette: { type: Boolean },
  steering: { type: Boolean },
  wheelCup: { type: Boolean },
  spareWheel: { type: Boolean },
  airCompressor: { type: Boolean },
  jackHandle: { type: Boolean },
  wheelPanna: { type: Boolean },
  mudFlaps: { type: Boolean },
  floorMat: { type: Boolean },
  photos: [String], // Store file paths for photos
});

const VehicleDetails = mongoose.model('VehicleDetails', vehicleSchema);
export default VehicleDetails
