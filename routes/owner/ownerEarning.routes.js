import express from "express";
import {
  createOwnerEarningFromBooking,
  getOwnerEarnings,
  getOwnerEarningsByOwner,
  getOwnerSummary,
  markOwnerEarningPaid,
  getOwnerDueReport
} from "../../controllers/Owner/ownerEarning.controller.js";

import { protect } from "../../middlewares/auth.middleware.js";

const router = express.Router();

router.post("/create", protect, createOwnerEarningFromBooking);
router.get("/", protect, getOwnerEarnings);
router.get("/due-report", protect, getOwnerDueReport);
router.get("/owner/:owner_id", protect, getOwnerEarningsByOwner);
router.get("/summary/:owner_id", protect, getOwnerSummary);
router.patch("/mark-paid/:id", protect, markOwnerEarningPaid);

export default router;