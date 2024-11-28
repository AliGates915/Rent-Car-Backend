import express from "express";
import {
  createVehicleMaintenance,
  updateVehicleMaintenance,
  deleteVehicleMaintenance,
  getVehicleMaintenance,
  getAllVehicleMaintenance,
} from "../controllers/vehicleMaintenance.js";
// import { verifyAdmin } from '../utils/verifyToken.js';
const router = express.Router();

// Create a new TourType
router.post("/", createVehicleMaintenance);

// Update an existing TourType by ID
router.put("/:id", updateVehicleMaintenance);

// Delete a TourType by ID
router.delete("/:id", deleteVehicleMaintenance);

// Get a specific TourType by ID
router.get("/:id", getVehicleMaintenance);

// Get all TourTypes
router.get("/", getAllVehicleMaintenance);

export default router;
