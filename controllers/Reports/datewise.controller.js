import { db } from "../../config/db.js";

export const getReceiptsReport = (req, res) => {
  const { from, to } = req.query;

  const sql = `
    SELECT * FROM cash_receipts
    WHERE DATE(created_at) BETWEEN ? AND ?
  `;

  db.query(sql, [from, to], (err, rows) => {
    if (err) return res.status(500).json(err);

    res.json(rows);
  });
};

// Expense Report 

export const getExpenseReport = (req, res) => {
  const { from, to } = req.query;

  const sql = `
    SELECT * FROM expense_vouchers
    WHERE DATE(created_at) BETWEEN ? AND ?
  `;

  db.query(sql, [from, to], (err, rows) => {
    if (err) return res.status(500).json(err);

    res.json(rows);
  });
};

