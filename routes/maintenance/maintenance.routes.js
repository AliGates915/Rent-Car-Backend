import express from "express";
import {
  addMaintenanceLog,
  getMaintenanceLogs,
  getMaintenanceById,
  updateMaintenance,
  deleteMaintenance,
  completeMaintenance,
  getDueMaintenance,
  getMaintenanceSummary,
  getMonthlyMaintenanceCosts,
} from "../../controllers/Maintenance/maintenance.controller.js";
import { protect } from "../../middlewares/auth.middleware.js";

const router = express.Router();

// All routes require authentication
router.use(protect);

// Main routes
router.route("/")
  .get(getMaintenanceLogs)
  .post(addMaintenanceLog);

router.route("/due")
  .get(getDueMaintenance);

router.route("/complete")
  .post(completeMaintenance);

router.route("/summary")
  .get(getMaintenanceSummary);

router.route("/monthly-costs")
  .get(getMonthlyMaintenanceCosts);

router.route("/:id")
  .get(getMaintenanceById)
  .put(updateMaintenance)
  .delete(deleteMaintenance);

export default router;