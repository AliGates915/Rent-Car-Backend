// backend/routes/Setup/setup.routes.js
import express from "express";
import { protect} from "../../middlewares/auth.middleware.js";
import { authorizeRoles } from "../../middlewares/role.middleware.js";
import {
  createSetupItem,
  getSetupItems,
  getSetupItemById,
  updateSetupItem,
  deleteSetupItem
} from "../../controllers/Setup/setupController.js";

const createSetupRoutes = (modelName) => {
  const router = express.Router();
  
  router.post("/", protect, authorizeRoles("admin"), createSetupItem(modelName));
  router.get("/", protect, getSetupItems(modelName));
  router.get("/:id", protect, getSetupItemById(modelName));
  router.put("/:id", protect, authorizeRoles("admin"), updateSetupItem(modelName));
  router.delete("/:id", protect, authorizeRoles("admin"), deleteSetupItem(modelName));
  
  return router;
};

export default createSetupRoutes;