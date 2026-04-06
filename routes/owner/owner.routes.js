import express from "express";
import {
  createOwner,
  getOwners,
  updateOwner,
  getOwnerById,
  getOwnerDocuments,
  deleteOwner,uploadOwnerDocument,
  checkOwnerDocumentsComplete
} from "../../controllers/Owner/owner.controller.js";
import { protect } from "../../middlewares/auth.middleware.js";
import { uploadOwnerDocuments } from "../../middlewares/upload.middleware.js";
import upload from "../../middlewares/upload.middleware.js";
const router = express.Router();

// Owner CRUD
router.post("/", protect, uploadOwnerDocuments, createOwner);
router.get("/", protect, getOwners);
router.get("/:id", protect, getOwnerById);
router.put("/:id", protect, uploadOwnerDocuments, updateOwner);
router.delete("/:id", protect, deleteOwner);

// Document Upload Routes
// DOCUMENTS
router.post(
  "/:owner_id/documents",
  protect,
  upload.single("images"),
  uploadOwnerDocument
);

router.get("/:owner_id/documents", protect, getOwnerDocuments);
router.get("/:owner_id/documents/status", protect, checkOwnerDocumentsComplete);

export default router;