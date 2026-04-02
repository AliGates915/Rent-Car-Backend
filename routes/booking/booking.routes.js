import express from "express";
import {
  getAvailableVehicles,
  createBooking,
  getBookings,
  getBookingById,
  updateBooking,
  cancelBooking,
  updateBookingStatus,
} from "../../controllers/Booking/booking.controller.js";

import { protect } from "../../middlewares/auth.middleware.js";

const router = express.Router();

router.get("/available", protect, getAvailableVehicles);

router.post("/", protect, createBooking);
router.get("/", protect, getBookings);
router.get("/:id", protect, getBookingById);

router.put("/:id", protect, updateBooking);
router.patch("/:id/cancel", protect, cancelBooking);
router.patch("/:id/status", protect, updateBookingStatus);

export default router;