import express from "express";
import {
  createVehicle,
  getVehicles,
  getVehicleById,
  updateVehicle,
  deleteVehicle,
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
  upload.any(),
  createVehicle
);

// GET
router.get("/", protect, getVehicles);
router.get("/:id", protect, getVehicleById);

// UPDATE
router.put("/:id", protect, authorizeRoles("admin"), updateVehicle);

// DELETE
router.delete("/:id", protect, authorizeRoles("admin"), deleteVehicle);

export default router;