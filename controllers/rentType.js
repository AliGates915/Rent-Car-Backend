import RentType from "../models/RentType.js";
import mongoose from "mongoose";

// Create VehicleType
export const createRentType = async (req, res, next) => {
  const newVehicleType = new RentType(req.body);
  try {
    const savedVehicleType = await newVehicleType.save();
    res.status(201).json(savedVehicleType);
  } catch (error) {
    next(error);
  }
};

// Update VehicleType
export const updateRentType = async (req, res, next) => {
  try {
    const updatedVehicleType = await RentType.findByIdAndUpdate(
      req.params.id,
      { $set: req.body },
      { new: true }
    );
    if (!updatedVehicleType) {
      return res.status(404).json({ message: "VehicleType is not found" });
    }
    res.status(200).json(updatedVehicleType);
  } catch (error) {
    next(error);
  }
};

// Delete VehicleType
export const deleteRentType = async (req, res, next) => {
  try {
    const deletedVehicleType = await RentType.findByIdAndDelete(req.params.id);
    if (!deletedVehicleType) {
      return res.status(404).json({ message: "VehicleType not found" });
    }
    res.status(200).json({ message: "Successfully deleted Tour Type", deletedVehicleType });
  } catch (error) {
    next(error);
  }
};

// Get a specific VehicleType by ID
export const getRentType= async (req, res, next) => {
  try {
    const tourId = req.params.id;

    // Validate if the id is a valid ObjectId
    if (!mongoose.Types.ObjectId.isValid(tourId)) {
      return res.status(400).json({ message: "Invalid ID format" });
    }

    const vehicleType = await RentType.findById(tourId);
    if (!vehicleType) {
      return res.status(404).json({ message: "VehicleType not found" });
    }

    res.status(200).json(vehicleType);
  } catch (error) {
    next(error);
  }
};

// Get all VehicleTypes
export const getAllRentType = async (req, res, next) => {
  try {
    const vehicleTypes = await RentType.find();

    if (vehicleTypes.length === 0) {
      return res.status(200).json({ message: "No Vehicle Types found" });
    }
    res.status(200).json(vehicleTypes);
  } catch (error) {
    next(error);
  }
};
