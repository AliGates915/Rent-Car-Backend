import  mongoose from 'mongoose';

const vehicleTypeSchema = new mongoose.Schema({
    vehicleTypes: {
        type: String,
        required: true,
    },
    
}, { timestamps: true });

const VehicleType = mongoose.model('VehicleType', vehicleTypeSchema);

export default VehicleType;
