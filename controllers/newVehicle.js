import NewVehicle from "../models/NewVehicle.js";
import mongoose from "mongoose";

// Create VehicleType
export const createNewVehicle = async (req, res, next) => {
  const newHotel = new NewVehicle(req.body);
  try {
    const savedHotel = await newHotel.save();
    res.status(200).json(savedHotel);
  } catch (error) {
    next(error);
  }
};

// Update VehicleType
export const updateNewVehicle = async (req, res, next) => {
  try {
    const updatedVehicleType = await NewVehicle.findByIdAndUpdate(
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
export const deleteNewVehicle = async (req, res, next) => {
  try {
    const deletedVehicleType = await NewVehicle.findByIdAndDelete(req.params.id);
    if (!deletedVehicleType) {
      return res.status(404).json({ message: "VehicleType not found" });
    }
    res.status(200).json({ message: "Successfully deleted Tour Type", deletedVehicleType });
  } catch (error) {
    next(error);
  }
};

// Get a specific VehicleType by ID
export const getNewVehicle = async (req, res, next) => {
  try {
    const vehicleTypes = await NewVehicle.find(); // Ensure this returns an array
    res.status(200).json(vehicleTypes);
  } catch (error) {
    console.error("Error fetching vehicle types:", error.message);
    res.status(500).json({ message: "Internal Server Error", error: error.message });
  }
};

// Get all VehicleTypes
export const getAllNewVehicle = async (req, res, next) => {
  try {
    const vehicleTypes = await NewVehicle.find();

    if (vehicleTypes.length === 0) {
      return res.status(200).json({ message: "No Vehicle Types found" });
    }
    res.status(200).json(vehicleTypes);
  } catch (error) {
    next(error);
  }
};
