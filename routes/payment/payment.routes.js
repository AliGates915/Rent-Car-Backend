import express from "express";
import {
  addPayment,
  getPaymentsByBooking,
  deletePayment, 
  updateBookingPaymentSummary
} from "../../controllers/Payment/payment.controller.js";

import { protect } from "../../middlewares/auth.middleware.js";

const router = express.Router();

// 🔥 ADD PAYMENT
router.post("/", protect, addPayment);
router.put("/booking/:booking_id", protect, updateBookingPaymentSummary);
// 🔥 GET PAYMENTS
router.get("/:booking_id", protect, getPaymentsByBooking);

// 🔥 DELETE PAYMENT (admin only recommended)
router.delete("/:id", protect, deletePayment);

export default router;