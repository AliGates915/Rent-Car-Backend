import multer from "multer";
import path from "path";
import CustomerDetails from "../models/CustomerDetails.js";

// Configure Multer for single photo uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/"); // Directory for storing files
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname)); // Rename file with a timestamp
  },
});

export const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // Limit file size to 5MB
  fileFilter: (req, file, cb) => {
    const fileTypes = /jpeg|jpg|png/;
    const extname = fileTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = fileTypes.test(file.mimetype);

    if (extname && mimetype) {
      return cb(null, true);
    }
    cb(new Error("Only images are allowed"));
  },
});

// Create new customer details
export const createCustomerDetails = async (req, res, next) => {
  try {
    // Get the last customerCode and increment it
    const lastCustomer = await CustomerDetails.findOne().sort({ customerCode: -1 });
    const nextCustomerCode = lastCustomer ? lastCustomer.customerCode + 1 : 1;

    // Check if a photo was uploaded
    const photo = req.file ? req.file.path : null;

    // Create a new instance of CustomerDetails
    const newCustomer = new CustomerDetails({
      ...req.body,
      customerCode: nextCustomerCode, // Automatically assign the next customerCode
      totalTransactions: 0, // Initialize totalTransactions to 0
      photo, // Add the photo path
    });

    // Save to the database
    const savedCustomer = await newCustomer.save();
    res.status(201).json({
      message: "Customer created successfully",
      customerDetails: savedCustomer,
    });
  } catch (error) {
    console.error("Error creating customer details:", error);
    res.status(500).json({
      message: "Failed to create customer details",
      error: error.message,
    });
  }
};

// Update
export const updateCustomerDetails = async (req, res, next) => {
    try {
      const updatedCustomer = await CustomerDetails.findByIdAndUpdate(
        req.params.id,
        { $set: req.body },
        { new: true }
      );
  
      if (!updatedCustomer) {
        return res.status(404).json({ message: "Customer not found" });
      }
  
      res.status(200).json(updatedCustomer);
    } catch (error) {
      console.error("Error updating customer details:", error);
      res.status(500).json({ message: "Failed to update customer details", error: error.message });
    }
  };

//   Delete data through ID
export const deleteCustomerDetails = async (req, res, next) => {
    try {
      const deletedCustomer = await CustomerDetails.findByIdAndDelete(req.params.id);
      if (!deletedCustomer) {
        return res.status(404).json({ message: "Customer not found" });
      }
      res.status(200).json({ message: "Customer deleted successfully", deletedCustomer });
    } catch (error) {
      console.error("Error deleting customer details:", error);
      res.status(500).json({ message: "Failed to delete customer details", error: error.message });
    }
  };
  
  
// DET All
export const getAllCustomerDetails = async (req, res, next) => {
    try {
      const customers = await CustomerDetails.find();
      res.status(200).json(customers);
    } catch (error) {
      console.error("Error fetching customer details:", error);
      res.status(500).json({ message: "Failed to fetch customer details", error: error.message });
    }
  };
// Get by ID
  export const getCustomerDetailsById = async (req, res, next) => {
    try {
      const customer = await CustomerDetails.findById(req.params.id);
      if (!customer) {
        return res.status(404).json({ message: "Customer not found" });
      }
      res.status(200).json(customer);
    } catch (error) {
      console.error("Error fetching customer details:", error);
      res.status(500).json({ message: "Failed to fetch customer details", error: error.message });
    }
  };
  
