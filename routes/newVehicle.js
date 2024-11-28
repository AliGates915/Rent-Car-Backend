import express from "express";
import {
  createNewVehicle,
  updateNewVehicle,
  deleteNewVehicle,
  getNewVehicle,
  getAllNewVehicle,
} from "../controllers/newVehicle.js";
// import { verifyAdmin } from '../utils/verifyToken.js';
const router = express.Router();

// Create a new TourType
router.post("/", createNewVehicle);

// Update an existing TourType by ID
router.put("/:id", updateNewVehicle);

// Delete a TourType by ID
router.delete("/:id", deleteNewVehicle);

// Get a specific TourType by ID
router.get("/:id", getNewVehicle);

// Get all TourTypes
router.get("/", getAllNewVehicle);

export default router;
