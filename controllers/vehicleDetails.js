import VehicleDetails from "../models/VehicleDetails.js";
import RentReceipt from '../models/RentReceipt.js';
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

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid ID format' });
    }

    const updatedVehicle = await VehicleDetails.findByIdAndUpdate(id, req.body, { new: true });
    if (!updatedVehicle) {
      return res.status(404).json({ message: 'Vehicle not found' });
    }
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

// Get a specific VehicleDetails by ID
export const getVehicleDetails = async (req, res, next) => {
  try {
    // const hotelId = req.params.id;

    // Validate if the id is a valid ObjectId
    // if (!mongoose.Types.ObjectId.isValid(hotelId)) {
    //   return res.status(400).json({ message: "Invalid ID format" });
    // }

    const vehicles  = await VehicleDetails.find({ isBooked: false });
    // if (vehicles ) {
    //   console.log("Fetched hotel:", vehicles );
    // }

    if (!vehicles ) {
      return res.status(404).json({ message: "vehicles  not found" });
    }

    res.status(200).json(vehicles);
  } catch (err) {
    next(err);
  }
};

// Get all VehicleTypes
export const getAllVehicleDetails = async (req, res, next) => {
  try {
    const availableVehicles = await VehicleDetails.find({ isBooked: false });

    if (availableVehicles.length === 0) {
      return res.status(200).json({ message: "No available vehicles found" });
    }

    res.status(200).json(availableVehicles);
  } catch (error) {
    console.error("Error fetching vehicle details:", error);
    res.status(500).json({ error: "Failed to fetch vehicle details" });
  }
};


// Book vehicle 
export const createBookVehicle = async (req, res, next) => {
  const { id: vehicleId } = req.params; // Extract ID from params

  if (!mongoose.Types.ObjectId.isValid(vehicleId)) {
    return res.status(400).json({ error: "Invalid Vehicle ID" });
  }

  try {
    // Find the vehicle first
    const vehicle = await VehicleDetails.findById(vehicleId);

    if (!vehicle) {
      return res.status(404).json({ error: 'Vehicle not found' });
    }
    if (vehicle.isBooked) {
      return res.status(400).json({ error: 'Vehicle already booked' });
    }

    // Only update `isBooked` field without revalidating other fields
    vehicle.isBooked = true;
    await vehicle.save();

    res.json({ message: 'Vehicle booked successfully', vehicle });
  } catch (error) {
    console.error("Error booking vehicle:", error);
    res.status(500).json({ error: 'Server error' });
  }
};
// Return vehicle 
export const getReturnVehicles = async (req, res) => {
  try {
    const rentedVehicles = await VehicleDetails.find({ isBooked: true });
    res.json(rentedVehicles);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
};

// Return the vehicle
export const createReturnVehicle = async (req, res, next) => {
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
  };



  // For save vehicle details
  export const createSaveVehicleForm = async (req, res) => {
    try {
      const { date, time, balanceAmount, condition, rentReceiptId } = req.body;
    
      // Log incoming request data
      console.log('Request Body:', req.body);
  
      // Validate data
      if (!date || !time || !balanceAmount || !condition || !rentReceiptId) {
          return res.status(400).json({ message: 'Missing required fields' });
      }
  
      // Check if rentReceiptId is valid ObjectId
      if (!mongoose.Types.ObjectId.isValid(rentReceiptId)) {
          return res.status(400).json({ message: 'Invalid RentReceipt ID' });
      }
  
    // Check if RentReceipt exists
    const rentReceipt = await RentReceipt.findById(rentReceiptId);
    if (!rentReceipt) {
        return res.status(400).json({ message: "RentReceipt not found" });
    }

    // Now create the VehicleDetails document, where balanceAmount is the reference to RentReceipt
    const newSaveVehicle = new VehicleDetails({
        date,
        time,
        condition,
        balanceAmount: rentReceipt._id,  // Save RentReceipt's ObjectId as balanceAmount
    });

        await newSaveVehicle.save();
        res.status(201).json({ message: "SaveVehicle created successfully", data: newSaveVehicle });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Server Error" });
    }
};



// Controller to fetch all SaveVehicle documents
export const getAllSaves = async (req, res, next) => {
  try {
    const availableVehicles = await VehicleDetails.find({ isSaved: true });

    if (availableVehicles.length === 0) {
      return res.status(200).json({ message: "No available vehicles found" });
    }

    res.status(200).json(availableVehicles);
  } catch (error) {
    console.error("Error fetching vehicle details:", error);
    res.status(500).json({ error: "Failed to fetch vehicle details" });
  }
};


export const createSaveVehicle = async (req, res) => {
  const { id: vehicleId } = req.params; // Extract ID from params

  if (!mongoose.Types.ObjectId.isValid(vehicleId)) {
    return res.status(400).json({ error: "Invalid Vehicle ID" });
  }

  try {
    // Find the vehicle first
    const vehicle = await VehicleDetails.findById(vehicleId);

    if (!vehicle) {
      return res.status(404).json({ error: 'Vehicle not found' });
    }
    if (vehicle.isSaved) {
      return res.status(400).json({ error: 'Vehicle already booked' });
    }

    // Only update `isBooked` field without revalidating other fields
    vehicle.isSaved = true;
    await vehicle.save();

    res.json({ message: 'Vehicle booked successfully', vehicle });
  } catch (error) {
    console.error("Error booking vehicle:", error);
    res.status(500).json({ error: 'Server error' });
  }
};

// Return the vehicle
export const createSaveVehicleById = async (req, res, next) => {
  const vehicleId = req.params.id;
  
    if (!mongoose.Types.ObjectId.isValid(vehicleId)) {
      return res.status(400).json({ error: "Invalid Vehicle ID" });
    }
  
    try {
      const vehicle = await VehicleDetails.findById(vehicleId);
  
      if (!vehicle) {
        return res.status(404).json({ error: 'Vehicle not found' });
      }
  
      if (!vehicle.isSaved) {
        return res.status(400).json({ error: 'Vehicle is not rented' });
      }
  
      vehicle.isSaved = false;
      vehicle.isBooked = false;

      await vehicle.save();
  
      res.json({ message: 'Vehicle returned successfully', vehicle });
    } catch (error) {
      res.status(500).json({ error: 'Server error' });
    }
  };