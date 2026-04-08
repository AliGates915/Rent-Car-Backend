import express from "express";
import {
  getAvailableVehicles,
  createBooking,
  getBookings,
  getBookingById,
  updateBooking,
  cancelBooking,
  getConfirmedBookings,
  updateBookingStatus,
} from "../../controllers/Booking/booking.controller.js";

import { protect } from "../../middlewares/auth.middleware.js";

import {
  getBookingHistory,
  getCustomerBookingHistory,
  getVehicleBookingHistory,
  getBookingTimeline,
  getBookingStatistics,
  exportBookingHistory
} from '../../controllers/Booking/bookingHistoryController.js';

const router = express.Router();

router.get("/available", protect, getAvailableVehicles);

router.post("/", protect, createBooking);
router.get("/", protect, getBookings);
router.get("/confirmed", getConfirmedBookings); 
router.get("/:id", protect, getBookingById);

router.put("/:id", protect, updateBooking);
router.patch("/:id/cancel", protect, cancelBooking);
router.patch("/:id/status", protect, updateBookingStatus);



// NEW HISTORY ROUTES
router.get("/history/list", protect, getBookingHistory);
router.get("/history/customer/:customerId", protect, getCustomerBookingHistory);
router.get("/history/vehicle/:vehicleId", protect, getVehicleBookingHistory);
router.get("/history/:id/timeline", protect, getBookingTimeline);
router.get("/statistics/summary", getBookingStatistics);
router.get("/export/history", protect, exportBookingHistory);



export default router;