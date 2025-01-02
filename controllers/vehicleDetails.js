import VehicleDetails from "../models/VehicleDetails.js";
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
    newVehicle.status = "Available";
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

// Get Vehicle Details by ID
export const idVehicleDetails = async (req, res, next) => {
  try {
    const vehicleDetails = await VehicleDetails.findById(req.params.id);
    if (!vehicleDetails) {
      return res.status(404).json({ message: "Vehicle details not found" });
    }
    res.status(200).json({ message: "Vehicle details retrieved successfully", vehicleDetails });
  } catch (error) {
    next(error);
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


// Get all VehicleTypes
export const getVehiclesDetails = async (req, res) => {
  try {
    const { status } = req.query; // Assume 'status' can be 'booked' or 'saved'

    let filter = {};

    // Based on the status query param, set the filter
    if (status === 'booked') {
      filter.isBooked = true;
    } else if (status === 'saved') {
      filter.isSaved = true;
    }

    const vehicles = await VehicleDetails.find(filter);

    if (!vehicles || vehicles.length === 0) {
      return res.status(404).json({ message: 'No vehicles found' });
    }

    res.status(200).json(vehicles);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
};

export const getBookVehicle = async (req, res) => {
    const { id } = req.params; // Extract the ID from the route parameters

    try {
        // Fetch vehicle details from the database using the ID
        const vehicle = await VehicleDetails.findById(id);

        // Check if the vehicle exists
        if (!vehicle) {
            return res.status(404).json({ message: 'Vehicle not found' });
        }

        // Return the vehicle data
        res.status(200).json(vehicle);
    } catch (error) {
        console.error('Error fetching vehicle:', error);
        res.status(500).json({ message: 'An error occurred while fetching vehicle details' });
    }
};
export const getAllVehicleDetails = async (req, res) => {
  try {
    const vehicles = await VehicleDetails.find({isBooked: false});

    if (vehicles.length === 0) {
      return res.status(404).json({ message: 'No vehicles found' });
    }

    res.status(200).json(vehicles);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
};

export const getAllVehicleDetailsDisplay = async (req, res) => {
  try {
    const vehicles = await VehicleDetails.find();

    if (vehicles.length === 0) {
      return res.status(404).json({ message: 'No vehicles found' });
    }

    res.status(200).json(vehicles);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
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
    vehicle.isSaved = true;
    vehicle.status = "Rent";
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
    // Fetch vehicles where isBooked is true
    const rentedVehicles = await VehicleDetails.find({ isBooked: true });
    
    if (!rentedVehicles || rentedVehicles.length === 0) {
      return res.status(404).json({ message: 'No rented vehicles found.' });
    }

    res.json(rentedVehicles);
  } catch (error) {
    console.error('Error fetching rented vehicles:', error);
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
  
      vehicle.isBooked = true;
      await vehicle.save();
  
      res.json({ message: 'Vehicle returned successfully', vehicle });
    } catch (error) {
      res.status(500).json({ error: 'Server error' });
    }
  };



  // For save vehicle details
  export const createSaveVehicleForm = async (req, res) => {
    try {
        const vehicleId = req.params.id;
        const { date, time, balanceAmount, condition } = req.body;

        // Validate request body
        if (!req.body) {
            return res.status(400).json({ message: "Request body is missing" });
        }
        if (!date) return res.status(400).json({ message: "Missing 'date' field" });
        if (!time) return res.status(400).json({ message: "Missing 'time' field" });
        if (balanceAmount === undefined)
            return res.status(400).json({ message: "Missing 'balanceAmount' field" });
        if (!condition) return res.status(400).json({ message: "Missing 'condition' field" });

        // Parse balanceAmount
        const balanceAmountParsed = parseFloat(balanceAmount);
        if (isNaN(balanceAmountParsed)) {
            return res.status(400).json({ message: "'balanceAmount' must be a valid number" });
        }

        // Find and update vehicle details
        const updatedVehicle = await VehicleDetails.findByIdAndUpdate(
            vehicleId,
            {   isSaved: false,
                isBooked: false,
                status: "Available",
                date,
                time,
                balanceAmount: balanceAmountParsed,
                condition,
            },
            { new: true } // Return the updated document
        );

        // Check if vehicle exists
        if (!updatedVehicle) {
            return res.status(404).json({ message: "Vehicle not found" });
        }

        // Respond with updated document
        res.status(200).json({
            message: "Vehicle details updated successfully",
            data: updatedVehicle,
        });
    } catch (error) {
        console.error("Error updating vehicle details:", error);
        res.status(500).json({ message: "Internal Server Error" });
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
export const createSaveVehicleById = async (req, res) => {
  const vehicleId = req.params.id;
  console.log("Vehicle ID received:", vehicleId);  // Debug

  if (!mongoose.Types.ObjectId.isValid(vehicleId)) {
    return res.status(400).json({ error: "Invalid Vehicle ID" });
  }

  try {
    const vehicle = await VehicleDetails.findById(vehicleId);
    if (!vehicle) {
      return res.status(404).json({ error: 'Vehicle not found' });
    }

    if (!vehicle.isSaved && !vehicle.isBooked) {
      return res.status(400).json({ error: 'Vehicle is already available' });
    }

    vehicle.isSaved = false;
    vehicle.isBooked = false;
    vehicle.status = "Available";

    await vehicle.save();
    console.log("Vehicle updated successfully:", vehicle);  // Debug

    res.json({
      message: 'Vehicle save status updated successfully',
      vehicle,
    });
  } catch (error) {
    console.error("Error in backend:", error);  // Debug
    res.status(500).json({ error: 'Server error' });
  }
};
