import express from "express";
import {
  createVehicle,
  getVehicles,
  getVehicleById,
  updateVehicle,
  deleteVehicle,
  getVehicleDocuments,
  createVehicleDocument,
  updateVehicleDocument,
  getVehiclesforBooking,
  deleteVehicleDocument
} from "../controllers/vehicle.controller.js";

import upload from "../middlewares/upload.middleware.js";
import { protect } from "../middlewares/auth.middleware.js";
import { authorizeRoles } from "../middlewares/role.middleware.js";

const router = express.Router();

// CREATE (with images)
router.post(
  "/",
  protect,
  authorizeRoles("admin"),
    upload.array("images", 5),
  createVehicle
);

// GET
router.get("/", protect, getVehicles);
router.get("/free", protect, getVehiclesforBooking);
router.get("/:id", protect, getVehicleById);

// UPDATE
router.put("/:id", protect, authorizeRoles("admin"),upload.array('images', 5), updateVehicle);

// DELETE
router.delete("/:id", protect, authorizeRoles("admin"), deleteVehicle);


// Vehicle Documents Routes
router.get('/:id/documents', protect, authorizeRoles('admin'), getVehicleDocuments);
router.post('/documents', protect, authorizeRoles('admin'), upload.single('document'), createVehicleDocument);
router.put('/documents/:id', protect, authorizeRoles('admin'), upload.single('document'), updateVehicleDocument);
router.delete('/documents/:id', protect, authorizeRoles('admin'), deleteVehicleDocument);

export default router;