// backend/controllers/expenseVouchers.controller.js
import { pool } from "../../config/db.js";
import { addLedgerEntry } from "../../utils/ledger.js";

// CREATE
export const addExpense = async (req, res) => {
  try {
    const { amount, expense_type, vendor_name, notes } = req.body;

    // Validate required fields
    if (!amount) {
      return res.status(400).json({ message: "Amount is required" });
    }
    if (!expense_type) {
      return res.status(400).json({ message: "Expense type is required" });
    }

    const [result] = await pool.query(
      `INSERT INTO expense_vouchers (amount, expense_type, vendor_name, notes) VALUES (?, ?, ?, ?)`,
      [amount, expense_type, vendor_name || null, notes || null]
    );

    // Add ledger entry
    await addLedgerEntry({
      entry_type: "expense",
      reference_id: result.insertId,
      reference_table: "expense_vouchers",
      credit: amount,
      debit: 0,
      description: `Expense voucher - ${expense_type}${vendor_name ? ` (${vendor_name})` : ''}`
    });

    res.json({ 
      message: "Expense added successfully", 
      id: result.insertId 
    });
  } catch (error) {
    console.error('Error in addExpense:', error);
    res.status(500).json({ error: error.message });
  }
};

// GET ALL
export const getExpenses = async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT * FROM expense_vouchers ORDER BY id DESC`
    );

    // Format amounts as numbers
    const formattedRows = rows.map(row => ({
      ...row,
      amount: Number(row.amount) || 0
    }));

    res.json(formattedRows);
  } catch (error) {
    console.error('Error in getExpenses:', error);
    res.status(500).json({ error: error.message });
  }
};

// GET BY ID
export const getExpenseById = async (req, res) => {
  try {
    const { id } = req.params;

    const [rows] = await pool.query(
      `SELECT * FROM expense_vouchers WHERE id=?`,
      [id]
    );

    if (!rows.length) {
      return res.status(404).json({ message: "Expense not found" });
    }

    res.json({
      ...rows[0],
      amount: Number(rows[0].amount) || 0
    });
  } catch (error) {
    console.error('Error in getExpenseById:', error);
    res.status(500).json({ error: error.message });
  }
};

// UPDATE
export const updateExpense = async (req, res) => {
  try {
    const { id } = req.params;
    const { amount, expense_type, vendor_name, notes } = req.body;

    // Check if expense exists
    const [existingRows] = await pool.query(
      `SELECT * FROM expense_vouchers WHERE id=?`,
      [id]
    );

    if (!existingRows.length) {
      return res.status(404).json({ message: "Expense not found" });
    }

    const oldAmount = Number(existingRows[0].amount);
    const newAmount = Number(amount);
    const amountDiff = newAmount - oldAmount;

    await pool.query(
      `UPDATE expense_vouchers SET amount=?, expense_type=?, vendor_name=?, notes=? WHERE id=?`,
      [amount, expense_type, vendor_name || null, notes || null, id]
    );

    // Add ledger entry for the adjustment if amount changed
    if (amountDiff !== 0) {
      await addLedgerEntry({
        entry_type: "expense_adjustment",
        reference_id: id,
        reference_table: "expense_vouchers",
        credit: amountDiff > 0 ? amountDiff : 0,
        debit: amountDiff < 0 ? Math.abs(amountDiff) : 0,
        description: `Expense voucher updated - amount changed from ${oldAmount} to ${newAmount}`
      });
    }

    res.json({ 
      message: "Expense updated successfully",
      old_amount: oldAmount,
      new_amount: newAmount
    });
  } catch (error) {
    console.error('Error in updateExpense:', error);
    res.status(500).json({ error: error.message });
  }
};

// DELETE
export const deleteExpense = async (req, res) => {
  try {
    const { id } = req.params;

    // Check if expense exists
    const [existingRows] = await pool.query(
      `SELECT * FROM expense_vouchers WHERE id=?`,
      [id]
    );

    if (!existingRows.length) {
      return res.status(404).json({ message: "Expense not found" });
    }

    const expense = existingRows[0];

    // Add reversal ledger entry before deletion
    await addLedgerEntry({
      entry_type: "expense_deleted",
      reference_id: id,
      reference_table: "expense_vouchers",
      debit: Number(expense.amount),
      credit: 0,
      description: `Expense voucher deleted - ${expense.expense_type} (${expense.vendor_name || 'No vendor'}) amount: ${expense.amount}`
    });

    // Delete the expense
    await pool.query(`DELETE FROM expense_vouchers WHERE id=?`, [id]);

    res.json({ 
      message: "Expense deleted successfully",
      deleted_expense: {
        id: expense.id,
        amount: expense.amount,
        expense_type: expense.expense_type,
        vendor_name: expense.vendor_name
      }
    });
  } catch (error) {
    console.error('Error in deleteExpense:', error);
    res.status(500).json({ error: error.message });
  }
};

// REPORT - Get expenses by date range
export const getExpenseReport = async (req, res) => {
  try {
    const { from, to } = req.query;

    if (!from || !to) {
      return res.status(400).json({ message: "From and To dates are required" });
    }

    const [rows] = await pool.query(
      `SELECT * FROM expense_vouchers WHERE DATE(created_at) BETWEEN ? AND ? ORDER BY created_at DESC`,
      [from, to]
    );

    // Calculate summary
    const summary = {
      total_expenses: rows.length,
      total_amount: rows.reduce((sum, row) => sum + (Number(row.amount) || 0), 0),
      by_type: {},
      by_vendor: {}
    };

    // Group by expense type
    rows.forEach(row => {
      const type = row.expense_type;
      if (!summary.by_type[type]) {
        summary.by_type[type] = {
          count: 0,
          total: 0
        };
      }
      summary.by_type[type].count++;
      summary.by_type[type].total += Number(row.amount) || 0;

      // Group by vendor
      if (row.vendor_name) {
        const vendor = row.vendor_name;
        if (!summary.by_vendor[vendor]) {
          summary.by_vendor[vendor] = {
            count: 0,
            total: 0
          };
        }
        summary.by_vendor[vendor].count++;
        summary.by_vendor[vendor].total += Number(row.amount) || 0;
      }
    });

    res.json({
      date_range: { from, to },
      summary,
      expenses: rows.map(row => ({
        ...row,
        amount: Number(row.amount) || 0
      }))
    });
  } catch (error) {
    console.error('Error in getExpenseReport:', error);
    res.status(500).json({ error: error.message });
  }
};

// GET expenses by type
export const getExpensesByType = async (req, res) => {
  try {
    const { expense_type } = req.params;
    const { from, to } = req.query;

    let query = `
      SELECT * FROM expense_vouchers 
      WHERE expense_type = ?
    `;
    const params = [expense_type];

    if (from && to) {
      query += ` AND DATE(created_at) BETWEEN ? AND ?`;
      params.push(from, to);
    }

    query += ` ORDER BY created_at DESC`;

    const [rows] = await pool.query(query, params);

    const total_amount = rows.reduce((sum, row) => sum + (Number(row.amount) || 0), 0);

    res.json({
      expense_type,
      date_range: { from, to },
      total_expenses: rows.length,
      total_amount,
      expenses: rows.map(row => ({
        ...row,
        amount: Number(row.amount) || 0
      }))
    });
  } catch (error) {
    console.error('Error in getExpensesByType:', error);
    res.status(500).json({ error: error.message });
  }
};

// GET expense summary by month/year
export const getExpenseSummary = async (req, res) => {
  try {
    const { year, month } = req.query;
    const currentYear = year || new Date().getFullYear();

    let query = `
      SELECT 
        expense_type,
        COUNT(*) as total_count,
        SUM(amount) as total_amount,
        AVG(amount) as average_amount,
        MIN(amount) as min_amount,
        MAX(amount) as max_amount
      FROM expense_vouchers
      WHERE YEAR(created_at) = ?
    `;
    const params = [currentYear];

    if (month) {
      query += ` AND MONTH(created_at) = ?`;
      params.push(month);
    }

    query += ` GROUP BY expense_type ORDER BY total_amount DESC`;

    const [rows] = await pool.query(query, params);

    res.json({
      year: currentYear,
      month: month || null,
      summary: rows.map(row => ({
        expense_type: row.expense_type,
        total_count: Number(row.total_count),
        total_amount: Number(row.total_amount) || 0,
        average_amount: Number(row.average_amount) || 0,
        min_amount: Number(row.min_amount) || 0,
        max_amount: Number(row.max_amount) || 0
      })),
      grand_total: rows.reduce((sum, row) => sum + (Number(row.total_amount) || 0), 0)
    });
  } catch (error) {
    console.error('Error in getExpenseSummary:', error);
    res.status(500).json({ error: error.message });
  }
};

// GET monthly expense report
export const getMonthlyExpenseReport = async (req, res) => {
  try {
    const { year } = req.query;
    const currentYear = year || new Date().getFullYear();

    const [rows] = await pool.query(`
      SELECT 
        MONTH(created_at) as month,
        MONTHNAME(created_at) as month_name,
        COUNT(*) as total_expenses,
        SUM(amount) as total_amount,
        GROUP_CONCAT(DISTINCT expense_type) as expense_types
      FROM expense_vouchers
      WHERE YEAR(created_at) = ?
      GROUP BY MONTH(created_at)
      ORDER BY month ASC
    `, [currentYear]);

    const monthlyData = Array(12).fill().map((_, i) => ({
      month: i + 1,
      month_name: new Date(currentYear, i, 1).toLocaleString('default', { month: 'long' }),
      total_expenses: 0,
      total_amount: 0,
      expense_types: []
    }));

    rows.forEach(row => {
      const monthIndex = row.month - 1;
      monthlyData[monthIndex].total_expenses = Number(row.total_expenses);
      monthlyData[monthIndex].total_amount = Number(row.total_amount) || 0;
      monthlyData[monthIndex].expense_types = row.expense_types ? row.expense_types.split(',') : [];
    });

    res.json({
      year: currentYear,
      monthly_report: monthlyData,
      yearly_total: monthlyData.reduce((sum, month) => sum + month.total_amount, 0)
    });
  } catch (error) {
    console.error('Error in getMonthlyExpenseReport:', error);
    res.status(500).json({ error: error.message });
  }
};