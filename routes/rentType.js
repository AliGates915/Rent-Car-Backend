import express from "express";
import {
  createRentType,
  updateRentType,
  deleteRentType,
  getRentType,
  getAllRentType,
} from "../controllers/rentType.js";
// import { verifyAdmin } from '../utils/verifyToken.js';
const router = express.Router();

// Create a new TourType
router.post("/", createRentType);

// Update an existing TourType by ID
router.put("/:id", updateRentType);

// Delete a TourType by ID
router.delete("/:id", deleteRentType);

// Get a specific TourType by ID
router.get("/:id", getRentType);

// Get all TourTypes
router.get("/", getAllRentType);

export default router;
