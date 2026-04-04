import express from "express";
import {
  createOwner,
  getOwners,
  updateOwner,
  getOwnerById,
  deleteOwner,
  uploadOwnerCNIC,
  uploadOwnerDrivingLicense
} from "../../controllers/Owner/owner.controller.js";
import { protect } from "../../middlewares/auth.middleware.js";
import { uploadOwnerDocuments } from "../../middlewares/upload.middleware.js";

const router = express.Router();

// Owner CRUD
router.post("/", protect, uploadOwnerDocuments, createOwner);
router.get("/", protect, getOwners);
router.get("/:id", protect, getOwnerById);
router.put("/:id", protect, uploadOwnerDocuments, updateOwner);
router.delete("/:id", protect, deleteOwner);

// Document Upload Routes
router.post(
  "/:id/upload-cnic",
  protect,
  uploadOwnerDocuments,
  uploadOwnerCNIC
);
router.post(
  "/:id/upload-driving-license",
  protect,
  uploadOwnerDocuments,
  uploadOwnerDrivingLicense
);

export default router;