import  mongoose from 'mongoose';

const vehicleMaintenanceSchema = new mongoose.Schema({
    vehicleMaintenance: {
        type: String,
        required: true,
    },
    
}, { timestamps: true });

const VehicleMaintenance = mongoose.model('VehicleMaintenance', vehicleMaintenanceSchema);

export default VehicleMaintenance;
