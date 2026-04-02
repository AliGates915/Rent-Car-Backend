import { createHandover, getHandovers } from "../../controllers/Handover/handover.controller.js";
import { protect } from "../../middlewares/auth.middleware.js";


import Experss from "express";
const router = Experss.Router();    

router.post("/", createHandover);
router.get("/", protect, getHandovers);

export default router;  