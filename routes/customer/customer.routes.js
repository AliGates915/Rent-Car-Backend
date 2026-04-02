import express from "express";
import {
  createCustomer,
  getCustomers,
  getCustomerById,
  updateCustomer,
  uploadCustomerDocument,
} from "../../controllers/Customer/customer.controller.js";
import { addCustomerReference } from "../../controllers/Customer/customer_reference.controller.js";

import upload from "../../middlewares/upload.middleware.js";
import { protect } from "../../middlewares/auth.middleware.js";
import { authorizeRoles } from "../../middlewares/role.middleware.js";

const router = express.Router();

// CUSTOMER
router.post("/", protect, createCustomer);
router.get("/", protect, getCustomers);
router.get("/:id", protect, getCustomerById);
router.put("/:id", protect, updateCustomer);    

// REFERENCES
router.post("/:customer_id/reference", protect, addCustomerReference);

// DOCUMENTS
router.post(
  "/:customer_id/document",
  protect,
  upload.any("images"),
  uploadCustomerDocument
);

export default router;