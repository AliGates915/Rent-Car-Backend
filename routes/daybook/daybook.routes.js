// backend/routes/reports.routes.js
import express from 'express'
import { protect } from "../../middlewares/auth.middleware.js";
import { getReceiptsReport, getExpenseReport } from "../../controllers/Reports/datewise.controller.js";
import { getProfitLoss, getDaybookDetailed } from "../../controllers/Reports/ledgerReport.controller.js";

const router = express.Router();    

router.get("/expense", protect, getExpenseReport);  
router.get("/receipt", protect, getReceiptsReport); 
router.get("/profit-loss", protect, getProfitLoss);
router.get("/daybook-detailed", protect, getDaybookDetailed); // Keep old for compatibility

export default router;