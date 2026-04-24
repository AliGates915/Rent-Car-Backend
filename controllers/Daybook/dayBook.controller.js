// backend/controllers/Reports/ledgerReport.controller.js
import { pool } from "../../config/db.js";

export const getDaybook = async (req, res) => {
  try {
    const { date } = req.query;

    if (!date) {
      return res.status(400).json({ message: "Date parameter is required" });
    }

    const sql = `
      SELECT 
        id,
        entry_type,
        description,
        debit,
        credit,
        created_at as entry_date,
        reference
      FROM ledgers
      WHERE DATE(created_at) = ?
      ORDER BY created_at DESC
    `;

    const [rows] = await pool.query(sql, [date]);

    // Calculate running balance
    let balance = 0;
    const formattedRows = rows.map(row => {
      balance = balance + (Number(row.debit) || 0) - (Number(row.credit) || 0);
      return {
        ...row,
        balance: balance,
        debit: Number(row.debit) || 0,
        credit: Number(row.credit) || 0,
        entry_date: row.entry_date
      };
    });

    const total_debit = formattedRows.reduce((sum, row) => sum + row.debit, 0);
    const total_credit = formattedRows.reduce((sum, row) => sum + row.credit, 0);

    res.json({
      date,
      entries: formattedRows,
      total_debit,
      total_credit,
      closing_balance: balance
    });
  } catch (error) {
    console.error('Daybook error:', error);
    res.status(500).json({ message: "Database error", error: error.message });
  }
};

// Get daybook with date range
export const getDaybookByDateRange = async (req, res) => {
  try {
    const { start_date, end_date } = req.query;

    if (!start_date || !end_date) {
      return res.status(400).json({ message: "Start date and end date are required" });
    }

    const sql = `
      SELECT 
        id,
        entry_type,
        description,
        debit,
        credit,
        created_at as entry_date,
        reference
      FROM ledgers
      WHERE DATE(created_at) BETWEEN ? AND ?
      ORDER BY created_at ASC
    `;

    const [rows] = await pool.query(sql, [start_date, end_date]);

    // Calculate running balance
    let balance = 0;
    const formattedRows = rows.map(row => {
      balance = balance + (Number(row.debit) || 0) - (Number(row.credit) || 0);
      return {
        ...row,
        balance: balance,
        debit: Number(row.debit) || 0,
        credit: Number(row.credit) || 0,
        entry_date: row.entry_date
      };
    });

    const total_debit = formattedRows.reduce((sum, row) => sum + row.debit, 0);
    const total_credit = formattedRows.reduce((sum, row) => sum + row.credit, 0);

    res.json({
      start_date,
      end_date,
      entries: formattedRows,
      total_debit,
      total_credit,
      closing_balance: balance
    });
  } catch (error) {
    console.error('Daybook by date range error:', error);
    res.status(500).json({ message: "Database error", error: error.message });
  }
};

// Get daybook summary grouped by entry type
export const getDaybookSummary = async (req, res) => {
  try {
    const { date } = req.query;

    if (!date) {
      return res.status(400).json({ message: "Date parameter is required" });
    }

    const sql = `
      SELECT 
        entry_type,
        COUNT(*) as total_entries,
        SUM(debit) as total_debit,
        SUM(credit) as total_credit,
        SUM(CASE WHEN debit > 0 THEN debit ELSE 0 END) as total_debit_amount,
        SUM(CASE WHEN credit > 0 THEN credit ELSE 0 END) as total_credit_amount
      FROM ledgers
      WHERE DATE(created_at) = ?
      GROUP BY entry_type
      ORDER BY entry_type
    `;

    const [rows] = await pool.query(sql, [date]);

    res.json({
      date,
      summary: rows.map(row => ({
        entry_type: row.entry_type,
        total_entries: Number(row.total_entries),
        total_debit: Number(row.total_debit) || 0,
        total_credit: Number(row.total_credit) || 0,
        total_debit_amount: Number(row.total_debit_amount) || 0,
        total_credit_amount: Number(row.total_credit_amount) || 0
      }))
    });
  } catch (error) {
    console.error('Daybook summary error:', error);
    res.status(500).json({ message: "Database error", error: error.message });
  }
};

// Keep the old getDaybookDetailed for backward compatibility if needed
export const getDaybookDetailed = async (req, res) => {
  try {
    const { date } = req.query;

    if (!date) {
      return res.status(400).json({ message: "Date parameter is required" });
    }

    const sql = `
      SELECT *
      FROM ledgers
      WHERE DATE(created_at) = ?
      ORDER BY id DESC
    `;

    const [rows] = await pool.query(sql, [date]);

    let total_debit = 0;
    let total_credit = 0;

    rows.forEach(r => {
      total_debit += Number(r.debit || 0);
      total_credit += Number(r.credit || 0);
    });

    res.json({
      date,
      total_debit,
      total_credit,
      net: total_debit - total_credit,
      entries: rows.map(row => ({
        ...row,
        debit: Number(row.debit) || 0,
        credit: Number(row.credit) || 0
      }))
    });
  } catch (error) {
    console.error('Daybook detailed error:', error);
    res.status(500).json({ message: "Database error", error: error.message });
  }
};

// Get ledger report by customer
export const getLedgerByCustomer = async (req, res) => {
  try {
    const { customer_id } = req.params;
    const { start_date, end_date } = req.query;

    if (!customer_id) {
      return res.status(400).json({ message: "Customer ID is required" });
    }

    let sql = `
      SELECT 
        id,
        entry_type,
        description,
        debit,
        credit,
        created_at as entry_date,
        reference,
        reference_id,
        reference_table
      FROM ledgers
      WHERE customer_id = ?
    `;

    const params = [customer_id];

    if (start_date && end_date) {
      sql += ` AND DATE(created_at) BETWEEN ? AND ?`;
      params.push(start_date, end_date);
    }

    sql += ` ORDER BY created_at ASC`;

    const [rows] = await pool.query(sql, params);

    // Calculate running balance and daily summary
    let balance = 0;
    const formattedRows = rows.map(row => {
      balance = balance + (Number(row.debit) || 0) - (Number(row.credit) || 0);
      return {
        ...row,
        balance: balance,
        debit: Number(row.debit) || 0,
        credit: Number(row.credit) || 0,
        entry_date: row.entry_date
      };
    });

    const total_debit = formattedRows.reduce((sum, row) => sum + row.debit, 0);
    const total_credit = formattedRows.reduce((sum, row) => sum + row.credit, 0);

    // Get customer details
    const [customerRows] = await pool.query(
      `SELECT id, customer_name, phone_no, balance FROM customers WHERE id = ?`,
      [customer_id]
    );

    res.json({
      customer: customerRows[0] || null,
      entries: formattedRows,
      summary: {
        total_debit,
        total_credit,
        net_balance: balance,
        opening_balance: formattedRows[0]?.balance - (formattedRows[0]?.debit - formattedRows[0]?.credit) || 0,
        closing_balance: balance
      },
      date_range: { start_date, end_date }
    });
  } catch (error) {
    console.error('Ledger by customer error:', error);
    res.status(500).json({ message: "Database error", error: error.message });
  }
};

// Get trial balance
export const getTrialBalance = async (req, res) => {
  try {
    const { as_on_date } = req.query;

    let sql = `
      SELECT 
        entry_type,
        SUM(debit) as total_debit,
        SUM(credit) as total_credit
      FROM ledgers
      WHERE 1=1
    `;

    const params = [];

    if (as_on_date) {
      sql += ` AND DATE(created_at) <= ?`;
      params.push(as_on_date);
    }

    sql += ` GROUP BY entry_type`;

    const [rows] = await pool.query(sql, params);

    const total_debit_all = rows.reduce((sum, row) => sum + (Number(row.total_debit) || 0), 0);
    const total_credit_all = rows.reduce((sum, row) => sum + (Number(row.total_credit) || 0), 0);

    res.json({
      as_on_date: as_on_date || new Date().toISOString().split('T')[0],
      entries: rows.map(row => ({
        entry_type: row.entry_type,
        total_debit: Number(row.total_debit) || 0,
        total_credit: Number(row.total_credit) || 0
      })),
      totals: {
        total_debit: total_debit_all,
        total_credit: total_credit_all,
        difference: total_debit_all - total_credit_all,
        is_balanced: total_debit_all === total_credit_all
      }
    });
  } catch (error) {
    console.error('Trial balance error:', error);
    res.status(500).json({ message: "Database error", error: error.message });
  }
};

// Get ledger report by reference
export const getLedgerByReference = async (req, res) => {
  try {
    const { reference_table, reference_id } = req.params;

    if (!reference_table || !reference_id) {
      return res.status(400).json({ message: "Reference table and ID are required" });
    }

    const sql = `
      SELECT 
        id,
        entry_type,
        description,
        debit,
        credit,
        created_at as entry_date,
        customer_id
      FROM ledgers
      WHERE reference_table = ? AND reference_id = ?
      ORDER BY created_at ASC
    `;

    const [rows] = await pool.query(sql, [reference_table, reference_id]);

    let balance = 0;
    const formattedRows = rows.map(row => {
      balance = balance + (Number(row.debit) || 0) - (Number(row.credit) || 0);
      return {
        ...row,
        balance: balance,
        debit: Number(row.debit) || 0,
        credit: Number(row.credit) || 0
      };
    });

    res.json({
      reference_table,
      reference_id,
      entries: formattedRows,
      total_debit: formattedRows.reduce((sum, row) => sum + row.debit, 0),
      total_credit: formattedRows.reduce((sum, row) => sum + row.credit, 0),
      closing_balance: balance
    });
  } catch (error) {
    console.error('Ledger by reference error:', error);
    res.status(500).json({ message: "Database error", error: error.message });
  }
};