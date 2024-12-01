import mongoose from 'mongoose';

const customerDetailsSchema = new mongoose.Schema({
    ownerCode: { type: Number, required: true, unique: true },
    regDate: { type: Date, required: true },
    customerName: { type: String, required: true },
    fatherName: { type: String },
    address: { type: String },
    cinc: { type: String},
    totalTransactions: { type: Number },
    mobileNo: { type: String },
    phone: { type: String },
    city: { type: String },
    profession: { type: String },
    referenceName: { type: String },
    referenceAddress: { type: String },
    referenceCity: { type: String },
    referenceMobile: { type: String },
    referencePhone: { type: String },
    referenceCINC: { type: String },
    profilePhotoUrl: { type: String },
    CINCPhotos: { type: [String] }, 
    DrivingLicense: { type: String },
  
}, { timestamps: true });

const CustomerDetails = mongoose.model('CustomerDetails', customerDetailsSchema);

export default CustomerDetails;
