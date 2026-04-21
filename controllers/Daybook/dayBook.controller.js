// backend/controllers/Reports/ledgerReport.controller.js
import { db } from "../../config/db.js";

export const getDaybook = (req, res) => {
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

  db.query(sql, [date], (err, rows) => {
    if (err) {
      console.error('Daybook error:', err);
      return res.status(500).json({ message: "Database error", error: err });
    }

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
  });
};

// Keep the old getDaybookDetailed for backward compatibility if needed
export const getDaybookDetailed = (req, res) => {
  const { date } = req.query;

  const sql = `
    SELECT *
    FROM ledgers
    WHERE DATE(created_at) = ?
    ORDER BY id DESC
  `;

  db.query(sql, [date], (err, rows) => {
    if (err) return res.status(500).json(err);

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
      entries: rows
    });
  });
};