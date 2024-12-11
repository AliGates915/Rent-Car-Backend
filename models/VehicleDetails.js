import mongoose from 'mongoose'

const vehicleSchema = new mongoose.Schema({
  registrationNo: { type: String, required: true },
  registeredCity: { type: String },
  carType: { type: String },
  carMake: { type: String  , required: true  [true, 'carMake is required'],},
  carModel: { type: String  , required: true
    [true, 'carModel is required'],
  },
  yearOfModel: { type: String , required: true 
    [true, 'yearOfModel is required'],
  },
  ratePerDay : { type: Number , required: true 
    [true, 'ratePerDay is required'],
  },
  color: { type: String },
  transmissionType: { type: String },
  engineCapacity: { type: String },
  chassisNo: { type: String, required: true 
    [true, 'chassisNo is required'],
  },
  engineNo: { type: String,  },
  fuelType: { type: String, required: true 
    [true, 'fuelType is required'],
  },
  fuelTankCapacity: { type: String },
  maxSpeed: { type: Number },
  seatingCapacity: { type: Number },
  inspectionDate: { type: Date },
  inspectionMileage: { type: String },
  location: { type: String },
  fuel: { type: String },
  priceVehicle: { type: String },
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
  documents: { type: Boolean },
  photos: [String], 
  isBooked: {
    type: Boolean,
    default: false,
  },
  // for save 
  date: { type: Date},
  time: { type: String },
  status: { type: String },
  condition: { type: String },
    balanceAmount: { 
        type: mongoose.Schema.Types.ObjectId,
        ref: 'RentReceipt',
    },
    isSaved: {
        type: Boolean,
        default: false,
    },
    rentReceiptId: { type: mongoose.Schema.Types.ObjectId,
       ref: 'RentReceipt'},

});

const VehicleDetails = mongoose.model('VehicleDetails', vehicleSchema);
export default VehicleDetails
