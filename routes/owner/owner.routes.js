import express from "express";
import {
  createOwner,
  getOwners,
  getOwnerById,
  updateOwner,
  deleteOwner
} from "../../controllers/Owner/owner.controller.js";

import { protect } from "../../middlewares/auth.middleware.js";

const router = express.Router();

// CREATE
router.post("/", protect, createOwner);

// GET ALL
router.get("/", protect, getOwners);

// GET SINGLE
router.get("/:id", protect, getOwnerById);

// UPDATE
router.put("/:id", protect, updateOwner);

// DELETE
router.delete("/:id", protect, deleteOwner);

export default router;