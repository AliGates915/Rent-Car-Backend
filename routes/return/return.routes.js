import express from "express";
import { returnVehicle } from "../../controllers/Return_Vehicle/return.controller.js";
import { protect } from "../../middlewares/auth.middleware.js";

const router = express.Router();

router.post("/", protect, returnVehicle);

export default router;