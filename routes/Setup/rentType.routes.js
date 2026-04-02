import express from "express";


import { protect } from "../../middlewares/auth.middleware.js";
import { authorizeRoles } from "../../middlewares/role.middleware.js";
import { createRentType, deleteRentType, getRentTypes, updateRentType } from "../../controllers/Setup/rentType.controller.js";



const router = express.Router();

// CREATE
router.post("/", protect, authorizeRoles("admin"), createRentType);

// GET ALL
router.get("/", protect, getRentTypes);

// UPDATE
router.put("/:id", protect, authorizeRoles("admin"), updateRentType);

// DELETE
router.delete("/:id", protect, authorizeRoles("admin"), deleteRentType);

export default router;