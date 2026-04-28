import express from 'express';
import {
  addExpense,
  getExpenses,
  getExpenseById,
  updateExpense,
  deleteExpense,
  getExpenseReport,
  getExpensesByType,
  getExpenseSummary,
  getMonthlyExpenseReport
} from '../../controllers/Expense/expense.controller.js';
import { protect } from '../../middlewares/auth.middleware.js';

const router = express.Router();

router.use(protect); // All routes require authentication

router.route('/')
  .get(getExpenses)
  .post(addExpense);

router.route('/report')
  .get(getExpenseReport);

router.route('/summary')
  .get(getExpenseSummary);

router.route('/monthly')
  .get(getMonthlyExpenseReport);

router.route('/type/:expense_type')
  .get(getExpensesByType);

router.route('/:id')
  .get(getExpenseById)
  .put(updateExpense)
  .delete(deleteExpense);

export default router;