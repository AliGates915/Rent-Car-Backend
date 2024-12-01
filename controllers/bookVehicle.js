import VehicleDetails from "../models/VehicleDetails.js";
import express from 'express'
const router = express.Router();
import mongoose from "mongoose";


  // GET /rented-vehicles - Fetch all rented vehicles
router.get('/rented-vehicles', async (req, res) => {
    try {
      const rentedVehicles = await VehicleDetails.find({ isBooked: true });
      res.json(rentedVehicles);
    } catch (error) {
      res.status(500).json({ error: 'Server error' });
    }
  });
  
  // POST /return-vehicle - Return a rented vehicle
  router.post('/return-vehicle/:id', async (req, res) => {
    const vehicleId = req.params.id;
  
    if (!mongoose.Types.ObjectId.isValid(vehicleId)) {
      return res.status(400).json({ error: "Invalid Vehicle ID" });
    }
  
    try {
      const vehicle = await VehicleDetails.findById(vehicleId);
  
      if (!vehicle) {
        return res.status(404).json({ error: 'Vehicle not found' });
      }
  
      if (!vehicle.isBooked) {
        return res.status(400).json({ error: 'Vehicle is not rented' });
      }
  
      vehicle.isBooked = false;
      await vehicle.save();
  
      res.json({ message: 'Vehicle returned successfully', vehicle });
    } catch (error) {
      res.status(500).json({ error: 'Server error' });
    }
  });
  
  
  export default router;
  

