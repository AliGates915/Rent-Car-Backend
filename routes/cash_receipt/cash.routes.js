import express from "express";
import {
  addReceipt,
  getReceipts,
  getReceiptById,
  updateReceipt,
  deleteReceipt,
  getReceiptReport
} from "../../controllers/Cash_receipt/receipt.controller.js";

import { protect } from "../../middlewares/auth.middleware.js";

const router = express.Router();

router.post("/", protect, addReceipt);
router.get("/", protect, getReceipts);
router.get("/:id", protect, getReceiptById);
router.put("/:id", protect, updateReceipt);
router.delete("/:id", protect, deleteReceipt);

router.get("/report/date", protect, getReceiptReport);

export default router;