import express from "express";
import {
  createExpenseVoucher,
  updateExpenseVoucher,
  deleteExpenseVoucher,
  getExpenseVoucher,
  getAllExpenseVoucher,
} from "../controllers/expenseVoucher.js";
// import { verifyAdmin } from '../utils/verifyToken.js';
const router = express.Router();

// Create a new TourType
router.post("/", createExpenseVoucher);

// Update an existing TourType by ID
router.put("/:id", updateExpenseVoucher);

// Delete a TourType by ID
router.delete("/:id", deleteExpenseVoucher);

// Get a specific TourType by ID
router.get("/:id", getExpenseVoucher);

// Get all TourTypes
router.get("/", getAllExpenseVoucher);

export default router;
