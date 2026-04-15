import express from "express";
import {
  addReceipt,
  getReceipts,
  getReceiptById,
  updateReceipt,
  deleteReceipt,
  getReceiptReport,
  getReceiptsByDateRange,
  getReceiptSummary,
  getReceiptReportData,
  getReceiptsGrouped,
  getCustomerWithBalance,
  getAllCustomersWithBalance,
} from "../../controllers/Cash_receipt/receipt.controller.js";

import { protect } from "../../middlewares/auth.middleware.js";

const router = express.Router();

// Customer balance routes
router.get('/customers/with-balance', getAllCustomersWithBalance);
router.get('/customers/:customer_id/balance', getCustomerWithBalance);

// IMPORTANT: Put specific routes BEFORE parameterized routes (/:id)
router.get("/report-data", protect, getReceiptReportData); // For raw data - SPECIFIC
router.get("/report", protect, getReceiptReport); // SPECIFIC
router.get('/date-range', getReceiptsByDateRange); // SPECIFIC
router.get('/summary', getReceiptSummary); // SPECIFIC
router.get('/grouped', getReceiptsGrouped); // SPECIFIC

// Generic routes (parameterized) - PUT THESE LAST
router.get("/", protect, getReceipts);
router.get("/:id", protect, getReceiptById);
router.post("/", protect, addReceipt);
router.put("/:id", protect, updateReceipt);
router.delete("/:id", protect, deleteReceipt);

export default router;