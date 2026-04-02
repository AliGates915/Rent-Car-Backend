import { db } from "../../config/db.js";

// ====================== PROFIT & LOSS ======================
export const getProfitLoss = (req, res) => {
  const { from, to } = req.query;

  if (!from || !to) {
    return res.status(400).json({ message: "from & to dates required" });
  }

  const sql = `
    SELECT 
      entry_type,
      SUM(debit) AS total_debit,
      SUM(credit) AS total_credit
    FROM ledgers
    WHERE DATE(created_at) BETWEEN ? AND ?
    GROUP BY entry_type
  `;

  db.query(sql, [from, to], (err, rows) => {
    if (err) return res.status(500).json(err);

    let total_income = 0;
    let total_expense = 0;

    let breakdown = {
      payments: 0,
      receipts: 0,
      expenses: 0,
      maintenance: 0,
      owner_payout: 0
    };

    rows.forEach(row => {
      const debit = Number(row.total_debit || 0);
      const credit = Number(row.total_credit || 0);

      // ✅ INCOME
      if (row.entry_type === "payment") {
        breakdown.payments += debit;
        total_income += debit;
      }

      if (row.entry_type === "receipt") {
        breakdown.receipts += debit;
        total_income += debit;
      }

      // ❌ EXPENSE
      if (row.entry_type === "expense") {
        breakdown.expenses += credit;
        total_expense += credit;
      }

      if (row.entry_type === "maintenance") {
        breakdown.maintenance += credit;
        total_expense += credit;
      }

      if (row.entry_type === "owner") {
        breakdown.owner_payout += credit;
        total_expense += credit;
      }
    });

    const net_profit = total_income - total_expense;

    res.json({
      from,
      to,
      total_income,
      total_expense,
      net_profit,
      breakdown
    });
  });
};


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