import express from "express";



import { createAccessoryType, deleteAccessoryType, getAccessoryTypes, updateAccessoryType } from "../../controllers/Setup/accessoryType.controller.js";
import { protect } from "../../middlewares/auth.middleware.js";
import { authorizeRoles } from "../../middlewares/role.middleware.js";

const router = express.Router();

// CREATE
router.post("/", protect, authorizeRoles("admin"), createAccessoryType);

// GET ALL
router.get("/", protect, getAccessoryTypes);

// UPDATE
router.put("/:id", protect, authorizeRoles("admin"), updateAccessoryType);

// DELETE
router.delete("/:id", protect, authorizeRoles("admin"), deleteAccessoryType);

export default router;