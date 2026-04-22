import { db } from "../../config/db.js";

// ====================== PROFIT & LOSS ======================
export const getProfitLoss = (req, res) => {
  const { from, to } = req.query;

  if (!from || !to) {
    return res.status(400).json({ message: "from & to dates required" });
  }

  // Get income from booking_payments table
  const incomeSql = `
    SELECT 
      payment_type,
      SUM(amount) as total_amount,
      DATE(created_at) as payment_date
    FROM booking_payments
    WHERE DATE(created_at) BETWEEN ? AND ?
      AND payment_type IN ('advance', 'payment')
    GROUP BY payment_type
  `;

  // Get security deposits (these are not income, but collected)
  const depositSql = `
    SELECT 
      SUM(amount) as total_deposits
    FROM booking_payments
    WHERE DATE(created_at) BETWEEN ? AND ?
      AND payment_type = 'security_deposit'
  `;

  // Get expenses from ledgers table
  const expenseSql = `
    SELECT 
      entry_type,
      SUM(credit) AS total_credit
    FROM ledgers
    WHERE DATE(created_at) BETWEEN ? AND ?
      AND entry_type IN ('expense', 'maintenance', 'owner')
    GROUP BY entry_type
  `;

  // Execute all queries
  Promise.all([
    new Promise((resolve, reject) => {
      db.query(incomeSql, [from, to], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    }),
    new Promise((resolve, reject) => {
      db.query(depositSql, [from, to], (err, rows) => {
        if (err) reject(err);
        else resolve(rows[0] || { total_deposits: 0 });
      });
    }),
    new Promise((resolve, reject) => {
      db.query(expenseSql, [from, to], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    })
  ])
  .then(([incomeRows, depositData, expenseRows]) => {
    let total_income = 0;
    let total_expense = 0;
    let total_deposits = Number(depositData.total_deposits || 0);

    let breakdown = {
      advance_payments: 0,
      regular_payments: 0,
      total_payments: 0,
      security_deposits: total_deposits,
      expenses: 0,
      maintenance: 0,
      owner_payout: 0
    };

    // Calculate income from payments
    incomeRows.forEach(row => {
      const amount = Number(row.total_amount || 0);
      if (row.payment_type === 'advance') {
        breakdown.advance_payments += amount;
      } else if (row.payment_type === 'payment') {
        breakdown.regular_payments += amount;
      }
    });

    breakdown.total_payments = breakdown.advance_payments + breakdown.regular_payments;
    total_income = breakdown.total_payments;

    // Calculate expenses
    expenseRows.forEach(row => {
      const amount = Number(row.total_credit || 0);
      if (row.entry_type === 'expense') {
        breakdown.expenses += amount;
        total_expense += amount;
      } else if (row.entry_type === 'maintenance') {
        breakdown.maintenance += amount;
        total_expense += amount;
      } else if (row.entry_type === 'owner') {
        breakdown.owner_payout += amount;
        total_expense += amount;
      }
    });

    const net_profit = total_income - total_expense;

    res.json({
      from,
      to,
      total_income,
      total_expense,
      net_profit,
      total_deposits_collected: total_deposits,
      breakdown
    });
  })
  .catch(err => {
    console.error('Error in getProfitLoss:', err);
    res.status(500).json({ error: err.message });
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