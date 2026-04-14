import express from "express";
import {
  addReceipt,
  getReceipts,
  getReceiptById,
  updateReceipt,
  deleteReceipt,
  getReceiptReport,
   getCustomerWithBalance,
  getAllCustomersWithBalance,
} from "../../controllers/Cash_receipt/receipt.controller.js";

import { protect } from "../../middlewares/auth.middleware.js";

const router = express.Router();

// Customer balance routes
router.get('/customers/with-balance', getAllCustomersWithBalance);
router.get('/customers/:customer_id/balance', getCustomerWithBalance);


router.post("/", protect, addReceipt);
router.get("/", protect, getReceipts);
router.get("/:id", protect, getReceiptById);
router.put("/:id", protect, updateReceipt);
router.delete("/:id", protect, deleteReceipt);

router.get("/report/date", protect, getReceiptReport);

export default router;