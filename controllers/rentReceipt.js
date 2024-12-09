import RentReceipt from "../models/RentReceipt.js";

// Create new customer details
export const createRentReceipt = async (req, res, next) => {
  try {
    // Get the last rent receipt's serial number, sorted by descending serialNo (ensure it's treated as a number)
    const lastSerialNo = await RentReceipt.findOne().sort({ serialNo: -1 });

    // Ensure serialNo is a number and calculate the next serialNo
    const nextSerialNo = lastSerialNo  ? (lastSerialNo.serialNo) + 1 : 1; 

    console.log("Next serialNo:", nextSerialNo); // Logs the next serial number

    // Create a new RentReceipt instance with the next serial number
    const newRentReceipt = new RentReceipt({
      ...req.body,
      serialNo: nextSerialNo, // Automatically assign the next serialNo
    });

    // Save to the database
    const savedRentReceipt = await newRentReceipt.save();
    res.status(201).json(savedRentReceipt);
  } catch (error) {
    console.error("Error creating rent receipt:", error);
    res.status(500).json({
      message: "Failed to create rent receipt",
      error: error.message,
    });
  }
};
// Update
export const updateRentReceipt = async (req, res, next) => {
  try {
    const updatedRentReceipt = await RentReceipt.findByIdAndUpdate(
      req.params.id,
      { $set: req.body },
      { new: true }
    );

    if (!updatedRentReceipt) {
      return res.status(404).json({ message: "Customer not found" });
    }

    res.status(200).json(updatedRentReceipt);
  } catch (error) {
    console.error("Error updating customer details:", error);
    res.status(500).json({
      message: "Failed to update customer details",
      error: error.message,
    });
  }
};

//   Delete data through ID
export const deleteRentReceipt = async (req, res, next) => {
  try {
    const deletedRentReceipt = await RentReceipt.findByIdAndDelete(
      req.params.id
    );
    if (!deletedRentReceipt) {
      return res.status(404).json({ message: "Customer not found" });
    }
    res
      .status(200)
      .json({ message: "Customer deleted successfully", deletedRentReceipt });
  } catch (error) {
    console.error("Error deleting customer details:", error);
    res.status(500).json({
      message: "Failed to delete customer details",
      error: error.message,
    });
  }
};

// DET All
export const getAllRentReceipt = async (req, res, next) => {
  try {
    const customers = await RentReceipt.find();
    res.status(200).json(customers);
  } catch (error) {
    console.error("Error fetching customer details:", error);
    res.status(500).json({
      message: "Failed to fetch customer details",
      error: error.message,
    });
  }
};
// Get by ID
export const getRentReceiptById = async (req, res, next) => {
  try {
    const customer = await RentReceipt.findById(req.params.id);
    if (!customer) {
      return res.status(404).json({ message: "Customer not found" });
    }
    res.status(200).json(customer);
  } catch (error) {
    console.error("Error fetching customer details:", error);
    res.status(500).json({
      message: "Failed to fetch customer details",
      error: error.message,
    });
  }
};
