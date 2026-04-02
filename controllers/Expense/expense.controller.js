import { db } from "../../config/db.js";
import { addLedgerEntry } from "../../utils/ledger.js";

// CREATE
export const addExpense = (req, res) => {
  const { amount, expense_type, vendor_name, notes } = req.body;

  db.query(
    `INSERT INTO expense_vouchers (amount, expense_type, vendor_name, notes) VALUES (?, ?, ?, ?)`,
    [amount, expense_type, vendor_name, notes],
    (err, result) => {
      if (err) return res.status(500).json(err);
      addLedgerEntry({
  entry_type: "expense",
  reference_id: result.insertId,
  reference_table: "expense_vouchers",
  credit: amount,
  description: "Expense voucher"
});
      res.json({ message: "Expense added", id: result.insertId });
    }
  );
};

// GET ALL
export const getExpenses = (req, res) => {
  db.query(`SELECT * FROM expense_vouchers ORDER BY id DESC`, (err, rows) => {
    if (err) return res.status(500).json(err);
    res.json(rows);
  });
};

// GET BY ID
export const getExpenseById = (req, res) => {
  const { id } = req.params;

  db.query(`SELECT * FROM expense_vouchers WHERE id=?`, [id], (err, rows) => {
    if (err) return res.status(500).json(err);
    if (!rows.length) return res.status(404).json({ message: "Not found" });

    res.json(rows[0]);
  });
};

// UPDATE
export const updateExpense = (req, res) => {
  const { id } = req.params;
  const { amount, expense_type, vendor_name, notes } = req.body;

  db.query(
    `UPDATE expense_vouchers SET amount=?, expense_type=?, vendor_name=?, notes=? WHERE id=?`,
    [amount, expense_type, vendor_name, notes, id],
    (err) => {
      if (err) return res.status(500).json(err);
      addLedgerEntry({
  entry_type: "expense",
  reference_id: result.insertId,
  reference_table: "expense_vouchers",
  credit: amount,
  description: "Expense voucher"
});
      res.json({ message: "Expense updated" });
    }
  );
};

// DELETE
export const deleteExpense = (req, res) => {
  const { id } = req.params;

  db.query(`DELETE FROM expense_vouchers WHERE id=?`, [id], (err) => {
    if (err) return res.status(500).json(err);

    res.json({ message: "Expense deleted" });
  });
};

// REPORT
export const getExpenseReport = (req, res) => {
  const { from, to } = req.query;

  db.query(
    `SELECT * FROM expense_vouchers WHERE DATE(created_at) BETWEEN ? AND ?`,
    [from, to],
    (err, rows) => {
      if (err) return res.status(500).json(err);

      res.json(rows);
    }
  );
};