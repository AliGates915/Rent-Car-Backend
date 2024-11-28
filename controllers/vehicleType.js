import VehicleType from "../models/VehicleType.js";
import mongoose from "mongoose";

// Create VehicleType
export const createVehicleType = async (req, res, next) => {
  const newVehicleType = new VehicleType(req.body);
  try {
    const savedVehicleType = await newVehicleType.save();
    res.status(201).json(savedVehicleType);
  } catch (error) {
    next(error);
  }
};

// Update VehicleType
export const updateVehicleType = async (req, res, next) => {
  try {
    const updatedVehicleType = await VehicleType.findByIdAndUpdate(
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
export const deleteVehicleType = async (req, res, next) => {
  try {
    const deletedVehicleType = await VehicleType.findByIdAndDelete(req.params.id);
    if (!deletedVehicleType) {
      return res.status(404).json({ message: "VehicleType not found" });
    }
    res.status(200).json({ message: "Successfully deleted Tour Type", deletedVehicleType });
  } catch (error) {
    next(error);
  }
};

// Get a specific VehicleType by ID
export const getVehicleType = async (req, res, next) => {
  try {
    const vehicleTypes = await VehicleType.find(); // Ensure this returns an array
    res.status(200).json(vehicleTypes);
  } catch (error) {
    console.error("Error fetching vehicle types:", error.message);
    res.status(500).json({ message: "Internal Server Error", error: error.message });
  }
};

// Get all VehicleTypes
export const getAllVehicleType = async (req, res, next) => {
  try {
    const vehicleTypes = await VehicleType.find();

    if (vehicleTypes.length === 0) {
      return res.status(200).json({ message: "No Vehicle Types found" });
    }
    res.status(200).json(vehicleTypes);
  } catch (error) {
    next(error);
  }
};
