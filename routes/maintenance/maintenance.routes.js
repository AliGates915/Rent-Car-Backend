import express from "express";
import {
  addMaintenanceLog,
  getMaintenanceLogs,
  getMaintenanceById,
  updateMaintenance,
  deleteMaintenance,
  completeMaintenance,
  getDueMaintenance
} from "../../controllers/Maintenance/maintenance.controller.js";

import { protect } from "../../middlewares/auth.middleware.js";

const router = express.Router();

router.post("/", protect, addMaintenanceLog);
router.get("/", protect, getMaintenanceLogs);
router.get("/:id", protect, getMaintenanceById);
router.put("/:id", protect, updateMaintenance);
router.delete("/:id", protect, deleteMaintenance);

router.post("/complete", protect, completeMaintenance);
router.get("/due", protect, getDueMaintenance);

export default router;