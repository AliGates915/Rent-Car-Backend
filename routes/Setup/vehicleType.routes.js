import express from "express";

import {
    createVehicleType,
    getVehicleTypes,
    getVehicleTypeById,
    updateVehicleType,
    deleteVehicleType,
} from "../../controllers/Setup/vehicleType.controller.js";
import { protect } from "../../middlewares/auth.middleware.js";
import { authorizeRoles } from "../../middlewares/role.middleware.js";

const router = express.Router();

router.post("/", protect, authorizeRoles("admin"), createVehicleType);
router.get("/", protect, getVehicleTypes);
router.get("/:id", protect, getVehicleTypeById);
router.put("/:id", protect, authorizeRoles("admin"), updateVehicleType);
router.delete("/:id", protect, authorizeRoles("admin"), deleteVehicleType);

export default router;