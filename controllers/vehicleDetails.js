import VehicleDetails from "../models/VehicleDetails.js";
import Photo from '../models/NewVehicle.js'
import mongoose from "mongoose";

// Create VehicleType
export const createVehicleDetails = async (req, res, next) => {
  try {
    const { photos, ...vehicleData } = req.body;

    // Save photo URLs to the NewVehicle collection and get their ObjectIds
    const photoDocuments = await Promise.all(
      photos.map(async (photoUrl) => {
        const newPhoto = new Photo({
          filePath: photoUrl, // Assuming you have filePath or similar in the Photo schema
        });
        return await newPhoto.save();
      })
    );

    const photoIds = photoDocuments.map((photo) => photo._id);

    // Save the new vehicle with photo references
    const newVehicle = new VehicleDetails({
      ...vehicleData,
      photos: photoIds, // Reference the photo documents
    });

    const savedVehicle = await newVehicle.save();
    res.status(201).json(savedVehicle);
  } catch (error) {
    console.error("Error creating vehicle details:", error.message);
    res.status(500).json({ error: 'Failed to create vehicle', message: error.message });
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
    const vehicleTypes = await VehicleDetails.find(); // Ensure this returns an array
    res.status(200).json(vehicleTypes);
  } catch (error) {
    console.error("Error fetching vehicle types:", error.message);
    res.status(500).json({ message: "Internal Server Error", error: error.message });
  }
};

// Get all VehicleTypes
export const getAllVehicleDetails = async (req, res, next) => {
  try {
    const vehicleTypes = await VehicleDetails.find();

    if (vehicleTypes.length === 0) {
      return res.status(200).json({ message: "No Vehicle Types found" });
    }
    res.status(200).json(vehicleTypes);
  } catch (error) {
    next(error);
  }
};
