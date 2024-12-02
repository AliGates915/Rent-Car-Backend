import OwnerDetails from "../models/OwnerDetails.js";

// Create a new Owner
export const createOwnerDetails = async (req, res, next) => {
  try {
    const { ownerName, vehicle } = req.body;

    // Check if the owner already exists
    let existingOwner = await OwnerDetails.findOne({ ownerName });

    if (existingOwner) {
      // If owner exists, increment the totalVehicle count and add the new vehicle
      existingOwner.totalVehicles = (existingOwner.totalVehicles || 1) + 1;

      if (vehicle) {
        existingOwner.vehicles.push(vehicle);
      }

      // Save the updated owner details
      const updatedOwner = await existingOwner.save();
      return res.status(200).json({
        message: "Owner already exists. Vehicle added successfully.",
        ownerDetails: updatedOwner,
      });
    } else {
      // Get the last ownerCode and increment it, start from 1 if no records exist
      const lastOwner = await OwnerDetails.findOne().sort({ ownerCode: -1 });
      const nextOwnerCode = lastOwner ? lastOwner.ownerCode + 1 : 1;

      // Create a new OwnerDetails instance with 1 vehicle
      const newOwner = new OwnerDetails({
        ...req.body,
        ownerCode: nextOwnerCode,
        totalVehicles: 1, // Start with 1 vehicle
        vehicles: vehicle ? [vehicle] : [], // Add the vehicle if provided
      });

      // Save the new owner to the database
      const savedOwner = await newOwner.save();
      res.status(201).json(savedOwner);
    }
  } catch (error) {
    console.error("Error creating owner details:", error);
    res.status(500).json({
      message: "Failed to create owner details",
      error: error.message,
    });
  }
};


// Update OwnerDetails by ID
export const updateOwnerDetails = async (req, res, next) => {
  try {
    const updatedOwner = await OwnerDetails.findByIdAndUpdate(
      req.params.id,
      { $set: req.body },
      { new: true }
    );

    if (!updatedOwner) {
      return res.status(404).json({ message: "Owner not found" });
    }

    res.status(200).json(updatedOwner);
  } catch (error) {
    console.error("Error updating owner details:", error);
    res.status(500).json({ message: "Failed to update owner details", error: error.message });
  }
};

// Delete OwnerDetails by ID
export const deleteOwnerDetails = async (req, res, next) => {
  try {
    const deletedOwner = await OwnerDetails.findByIdAndDelete(req.params.id);

    if (!deletedOwner) {
      return res.status(404).json({ message: "Owner not found" });
    }

    res.status(200).json({ message: "Owner deleted successfully", deletedOwner });
  } catch (error) {
    console.error("Error deleting owner details:", error);
    res.status(500).json({ message: "Failed to delete owner details", error: error.message });
  }
};

// Get OwnerDetails by ID
export const getOwnerDetails = async (req, res, next) => {
  try {
    const owner = await OwnerDetails.findById(req.params.id);

    if (!owner) {
      return res.status(404).json({ message: "Owner not found" });
    }

    res.status(200).json(owner);
  } catch (error) {
    console.error("Error fetching owner details:", error);
    res.status(500).json({ message: "Failed to fetch owner details", error: error.message });
  }
};

// Get All OwnerDetails
export const getAllOwnerDetails = async (req, res, next) => {
  try {
    const owners = await OwnerDetails.find();

    if (owners.length === 0) {
      return res.status(200).json({ message: "No owners found" });
    }

    res.status(200).json(owners);
  } catch (error) {
    console.error("Error fetching all owners:", error);
    res.status(500).json({ message: "Failed to fetch owners", error: error.message });
  }
};
