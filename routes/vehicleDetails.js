import express from "express";
import {
  createVehicleDetails,
  updateVehicleDetails,
  deleteVehicleDetails,
  getVehicleDetails,
  getAllVehicleDetails,
} from "../controllers/vehicleDetails.js";
// import { verifyAdmin } from '../utils/verifyToken.js';
const router = express.Router();

// Create a new TourType
router.post("/", createVehicleDetails);

// Update an existing TourType by ID
router.put("/:id", updateVehicleDetails);

// Delete a TourType by ID
router.delete("/:id", deleteVehicleDetails);

// Get a specific TourType by ID
router.get("/:id", getVehicleDetails);

// Get all TourTypes
router.get("/", getAllVehicleDetails);

export default router;
