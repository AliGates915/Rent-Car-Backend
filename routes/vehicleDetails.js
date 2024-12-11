import express from "express";
import {
  createVehicleDetails,
  updateVehicleDetails,
  deleteVehicleDetails,
  // getVehicleDetails,
  getAllVehicleDetails,
  createBookVehicle,
  getReturnVehicles,
  createReturnVehicle,
  createSaveVehicleForm,
  getAllSaves,
  getVehiclesDetails,
  createSaveVehicle,
  // createSaveVehicleById,
  getAllVehicleDetailsDisplay,
  getBookVehicle,
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
// router.get("/:id", getVehicleDetails);

// Get all Booking Vehicle
router.get("/", getAllVehicleDetails);
router.get("/display", getAllVehicleDetailsDisplay);
router.get("/booking", getVehiclesDetails);
// post a new booking vehicle
router.post('/book-vehicle/:id', createBookVehicle)
// get by id vehicle
router.get('/book-vehicle/:id', getBookVehicle)
router.get('/return-vehicle', getReturnVehicles)
// No need
router.post('/return-vehicle/:id', createReturnVehicle)

// save vehicle
// isSaved True
router.post('/save-return-vehicle/:id', createSaveVehicle)
router.get('/saveVehicle', getAllSaves)

router.patch('/save-form/:id', createSaveVehicleForm)
// both are false
// router.post('/save-vehicle/:id', createSaveVehicleById) 

export default router;
