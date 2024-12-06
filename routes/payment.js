import express from "express";
import {
  createPaymentVoucher,
  updatePaymentVoucher,
  deletePaymentVoucher,
  getPaymentVoucher,
  getAllPaymentVoucher,
} from "../controllers/paymentVoucher.js";
// import { verifyAdmin } from '../utils/verifyToken.js';
const router = express.Router();

// Create a new TourType
router.post("/", createPaymentVoucher);

// Update an existing TourType by ID
router.put("/:id", updatePaymentVoucher);

// Delete a TourType by ID
router.delete("/:id", deletePaymentVoucher);

// Get a specific TourType by ID
router.get("/:id", getPaymentVoucher);

// Get all TourTypes
router.get("/", getAllPaymentVoucher);

export default router;
