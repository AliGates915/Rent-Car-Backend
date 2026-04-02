import express from "express";



import { protect } from "../../middlewares/auth.middleware.js";
import { createMaintenanceType, deleteMaintenanceType, getMaintenanceTypes, updateMaintenanceType } from "../../controllers/Setup/maintenanceType.controller.js";
import { authorizeRoles } from "../../middlewares/role.middleware.js";

const router = express.Router();

router.post("/", protect, authorizeRoles("admin"), createMaintenanceType);
router.get("/", protect, getMaintenanceTypes);
router.put("/:id", protect, authorizeRoles("admin"), updateMaintenanceType);
router.delete("/:id", protect, authorizeRoles("admin"), deleteMaintenanceType);

export default router;