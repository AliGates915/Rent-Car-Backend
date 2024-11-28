import VehicleMaintenance from "../models/VehicleMaintenance.js";
import mongoose from "mongoose";

// Create VehicleType
export const createVehicleMaintenance = async (req, res, next) => {
  const newVehicleType = new VehicleMaintenance(req.body);
  try {
    const savedVehicleType = await newVehicleType.save();
    res.status(201).json(savedVehicleType);
  } catch (error) {
    next(error);
  }
};

// Update VehicleType
export const updateVehicleMaintenance = async (req, res, next) => {
  try {
    const updatedVehicleType = await VehicleMaintenance.findByIdAndUpdate(
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
export const deleteVehicleMaintenance = async (req, res, next) => {
  try {
    const deletedVehicleType = await VehicleMaintenance.findByIdAndDelete(req.params.id);
    if (!deletedVehicleType) {
      return res.status(404).json({ message: "VehicleType not found" });
    }
    res.status(200).json({ message: "Successfully deleted Tour Type", deletedVehicleType });
  } catch (error) {
    next(error);
  }
};

// Get a specific VehicleType by ID
export const getVehicleMaintenance = async (req, res, next) => {
  try {
    const tourId = req.params.id;

    // Validate if the id is a valid ObjectId
    if (!mongoose.Types.ObjectId.isValid(tourId)) {
      return res.status(400).json({ message: "Invalid ID format" });
    }

    const vehicleType = await VehicleMaintenance.findById(tourId);
    if (!vehicleType) {
      return res.status(404).json({ message: "VehicleType not found" });
    }

    res.status(200).json(vehicleType);
  } catch (error) {
    next(error);
  }
};

// Get all VehicleTypes
export const getAllVehicleMaintenance = async (req, res, next) => {
  try {
    const vehicleTypes = await VehicleMaintenance.find();

    if (vehicleTypes.length === 0) {
      return res.status(200).json({ message: "No Vehicle Types found" });
    }
    res.status(200).json(vehicleTypes);
  } catch (error) {
    next(error);
  }
};
