import express from "express";
import {
  createCustomer,
  getCustomers,
  getCustomerById,
  updateCustomer,
  deleteCustomer, 
  uploadCustomerDocument,
  getCustomerDocuments
} from "../../controllers/Customer/customer.controller.js";
import { addCustomerReference, getCustomerReferences, deleteCustomerReference, updateCustomerReference } from "../../controllers/Customer/customer_reference.controller.js";

import upload from "../../middlewares/upload.middleware.js";
import { protect } from "../../middlewares/auth.middleware.js";

const router = express.Router();

// CUSTOMER
router.post("/", protect, createCustomer);
router.get("/", protect, getCustomers);
router.get("/:id", protect, getCustomerById);
router.put("/:id", protect, updateCustomer);  
router.delete("/:id", protect, deleteCustomer);

// REFERENCES
router.post("/:customer_id/references", protect, addCustomerReference);
router.get("/:customer_id/references", protect, getCustomerReferences);
router.put("/:customer_id/references/:reference_id", protect, updateCustomerReference);
router.delete("/:customer_id/references/:reference_id", protect, deleteCustomerReference);

// DOCUMENTS
router.post(
  "/:customer_id/documents",
  protect,
  upload.single("images"),
  uploadCustomerDocument
);
router.get("/:customer_id/documents", protect, getCustomerDocuments);

export default router;