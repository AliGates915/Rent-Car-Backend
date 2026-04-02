import express from "express";

import {protect} from "../../middlewares/auth.middleware.js";

import { getDaybook } from "../../controllers/Daybook/dayBook.controller.js";

const router = express.Router();

router.get("/", protect, getDaybook);

export default router;  