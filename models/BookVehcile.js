import mongoose from 'mongoose'

const bookVehicleSchema = new mongoose.Schema({
  registrationNo: { type: String, required: true },
  carType: { type: String },
  carMake: { type: String },
  carModel: { type: String  },
  yearOfModel: { type: String  },
  ratePerDay : { type: Number  },
  color: { type: String },
  transmissionType: { type: String },
  location: { type: String },
  photos: [String], 
});

const BookVehicle = mongoose.model('BookVehicle', bookVehicleSchema);
export default BookVehicle
