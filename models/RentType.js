import  mongoose from 'mongoose';

const rentTypeSchema = new mongoose.Schema({
    rentTypes: {
        type: String,
        required: true,
    },
    
}, { timestamps: true });

const RentType = mongoose.model('RentType', rentTypeSchema);

export default RentType;
