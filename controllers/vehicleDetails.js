import VehicleDetails from "../models/VehicleDetails.js";
import Photo from '../models/NewVehicle.js'
import mongoose from "mongoose";

// Create VehicleType
export const createVehicleDetails = async (req, res, next) => {
  try {
    const { photos, ...vehicleData } = req.body;

    // Create a new VehicleDetails document with photo URLs directly
    const newVehicle = new VehicleDetails({
      ...vehicleData,
      photos, // Save photo URLs directly in the vehicle document
    });

    // Save the vehicle document to the database
    const savedVehicle = await newVehicle.save();

    res.status(201).json({
      message: 'Vehicle details created successfully',
      vehicle: savedVehicle,
    });
  } catch (error) {
    console.error("Error creating vehicle details:", error.message);
    res.status(500).json({
      error: 'Failed to create vehicle',
      message: error.message,
    });
  }
};

// Update VehicleType
export const updateVehicleDetails = async (req, res, next) => {
    try {
        const { id } = req.params;
        const updatedVehicle = await VehicleDetails.findByIdAndUpdate(id, req.body, { new: true });
        if (!updatedVehicle) return res.status(404).json({ message: 'Vehicle not found' });
        res.status(200).json(updatedVehicle);
      } catch (error) {
        res.status(500).json({ error: 'Failed to update vehicle' });
      }
};

// Delete VehicleType
export const deleteVehicleDetails = async (req, res, next) => {
  try {
    const deletedVehicleType = await VehicleDetails.findByIdAndDelete(req.params.id);
    if (!deletedVehicleType) {
      return res.status(404).json({ message: "VehicleType not found" });
    }
    res.status(200).json({ message: "Successfully deleted Tour Type", deletedVehicleType });
  } catch (error) {
    next(error);
  }
};

// Get a specific VehicleType by ID
export const getVehicleDetails = async (req, res, next) => {
  try {
    const hotelId = req.params.id;

    // Validate if the id is a valid ObjectId
    if (!mongoose.Types.ObjectId.isValid(hotelId)) {
      return res.status(400).json({ message: "Invalid ID format" });
    }

    const hotel = await VehicleDetails.findById(hotelId);
    if (hotel) {
      console.log("Fetched hotel:", hotel);
    }

    if (!hotel) {
      return res.status(404).json({ message: "Hotel not found" });
    }

    res.status(200).json(hotel);
  } catch (err) {
    next(err);
  }
};

// Get all VehicleTypes
export const getAllVehicleDetails = async (req, res, next) => {
  try {
    const vehicleTypes = await VehicleDetails.find().populate('photos');

    if (vehicleTypes.length === 0) {
      return res.status(200).json({ message: "No Vehicle Types found" });
    }
    res.status(200).json(vehicleTypes);
  } catch (error) {
    console.error("Error fetching vehicle details:", error); // Detailed log
    res.status(500).json({ error: "Failed to fetch vehicle details", message: error.message });
  }
};
