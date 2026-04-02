import express from "express";
import {
  addExpense,
  getExpenses,
  getExpenseById,
  updateExpense,
  deleteExpense,
  getExpenseReport
} from "../../controllers/Expense/expense.controller.js";

import { protect } from "../../middlewares/auth.middleware.js";

const router = express.Router();

router.post("/", protect, addExpense);
router.get("/", protect, getExpenses);
router.get("/:id", protect, getExpenseById);
router.put("/:id", protect, updateExpense);
router.delete("/:id", protect, deleteExpense);

router.get("/report/date", protect, getExpenseReport);

export default router;