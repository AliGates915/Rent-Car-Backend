import multer from "multer";
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
  createSaveVehicleById,
  getAllVehicleDetailsDisplay,
  idVehicleDetails,
  getBookVehicle,
} from "../controllers/vehicleDetails.js";
import path from 'path';

const router = express.Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/'); // Directory for storing files
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname)); // Rename the file
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // Limit file size to 5MB
  fileFilter: (req, file, cb) => {
    const fileTypes = /jpeg|jpg|png/;
    const extname = fileTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = fileTypes.test(file.mimetype);

    if (extname && mimetype) {
      return cb(null, true);
    }
    cb(new Error('Only images are allowed'));
  },
});

// Define the route with `upload.array` middleware for multiple files
router.post('/create', upload.array('photos', 10), createVehicleDetails);

// Update an existing TourType by ID
router.put("/:id", updateVehicleDetails);

// Delete a TourType by ID
router.delete("/:id", deleteVehicleDetails);

// vehicle details by ID
router.get("/:id", idVehicleDetails);

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

router.post('/save-form/:id', createSaveVehicleForm)
// both are false
router.post('/save-vehicle/:id', createSaveVehicleById) 

export default router;
