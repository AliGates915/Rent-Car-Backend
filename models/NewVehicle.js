import  mongoose from 'mongoose';

const NewVehicleSchema = new mongoose.Schema({
    photos: {
        type:[String],
    },
    
}, { timestamps: true });

const NewVehicle = mongoose.model('Photo', NewVehicleSchema);

export default NewVehicle;
