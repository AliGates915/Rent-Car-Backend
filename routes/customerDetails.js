import express from "express";
import {
  createCustomerDetails,
  getAllCustomerDetails,
  getCustomerDetailsById,
  updateCustomerDetails,
  deleteCustomerDetails,
} from "../controllers/customerDetails.js";

const router = express.Router();

// Create new customer
router.post("/", createCustomerDetails);

// Get all customers
router.get("/", getAllCustomerDetails);

// Get customer by ID
router.get("/:id", getCustomerDetailsById);

// Update customer details
router.put("/:id", updateCustomerDetails);

// Delete customer
router.delete("/:id", deleteCustomerDetails);

export default router;
