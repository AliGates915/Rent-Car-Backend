import express from 'express'

import {protect} from "../../middlewares/auth.middleware.js";
import {authorizeRoles} from "../../middlewares/role.middleware.js";

import {getReceiptsReport, getExpenseReport} from "../../controllers/Reports/datewise.controller.js";
import {getProfitLoss,
  getDaybookDetailed} from "../../controllers/Reports/ledgerReport.controller.js";
const router = express.Router();    

router.get("/expense", protect,  getExpenseReport);  
router.get("/receipt", protect,  getReceiptsReport); 

// PROFIT LOSS
router.get("/profit-loss", protect, getProfitLoss);

// DAYBOOK
router.get("/daybook", protect, getDaybookDetailed);

export default router;