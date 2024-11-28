import express from "express";
import {
  createVehicleType,
  updateVehicleType,
  deleteVehicleType,
  getVehicleType,
  getAllVehicleType,
} from "../controllers/vehicleType.js";
// import { verifyAdmin } from '../utils/verifyToken.js';
const router = express.Router();

// Create a new TourType
router.post("/", createVehicleType);

// Update an existing TourType by ID
router.put("/:id", updateVehicleType);

// Delete a TourType by ID
router.delete("/:id", deleteVehicleType);

// Get a specific TourType by ID
router.get("/:id", getVehicleType);

// Get all TourTypes
router.get("/", getAllVehicleType);

export default router;
