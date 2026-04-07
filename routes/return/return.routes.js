// backend/routes/returnRoutes.js
import express from "express";
import { 
  returnVehicle, 
  getReturns, 
  getReturnById, 
  updateReturn, 
  deleteReturn 
} from "../../controllers/Return_Vehicle/return.controller.js";
import { protect } from "../../middlewares/auth.middleware.js";

const router = express.Router();

// GET routes
router.get("/", protect, getReturns);
router.get("/:id", protect, getReturnById);

// POST routes
router.post("/", protect, returnVehicle);

// PUT/PATCH routes
router.put("/:id", protect, updateReturn);
router.patch("/:id", protect, updateReturn);

// DELETE routes
router.delete("/:id", protect, deleteReturn);

export default router;