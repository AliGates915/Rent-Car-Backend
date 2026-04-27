import { pool } from "../../config/db.js";

// ====================== PROFIT & LOSS ======================
export const getProfitLoss = async (req, res) => {
  try {
    const { from, to } = req.query;

    if (!from || !to) {
      return res.status(400).json({ message: "from & to dates required" });
    }

    // Get income from booking_payments table - removed non-aggregated column
    const incomeSql = `
      SELECT 
        payment_type,
        SUM(amount) as total_amount
      FROM booking_payments
      WHERE DATE(created_at) BETWEEN ? AND ?
        AND payment_type IN ('advance', 'payment')
      GROUP BY payment_type
    `;

    // Get security deposits
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

    // Execute all queries in parallel
    const [incomeRows] = await pool.query(incomeSql, [from, to]);
    const [depositRows] = await pool.query(depositSql, [from, to]);
    const [expenseRows] = await pool.query(expenseSql, [from, to]);

    const depositData = depositRows[0] || { total_deposits: 0 };
    
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
    const profit_margin = total_income > 0 ? (net_profit / total_income) * 100 : 0;

    // Get additional statistics
    const [transactionCount] = await pool.query(`
      SELECT 
        COUNT(*) as total_transactions,
        COUNT(DISTINCT booking_id) as unique_bookings
      FROM booking_payments
      WHERE DATE(created_at) BETWEEN ? AND ?
        AND payment_type IN ('advance', 'payment')
    `, [from, to]);

    res.json({
      date_range: { from, to },
      summary: {
        total_income,
        total_expense,
        net_profit,
        profit_margin: profit_margin.toFixed(2),
        total_deposits_collected: total_deposits,
        total_transactions: transactionCount[0]?.total_transactions || 0,
        unique_bookings: transactionCount[0]?.unique_bookings || 0
      },
      breakdown
    });
  } catch (error) {
    console.error('Error in getProfitLoss:', error);
    res.status(500).json({ error: error.message });
  }
};

// ====================== DAYBOOK DETAILED ======================
export const getDaybookDetailed = async (req, res) => {
  try {
    const { date } = req.query;

    if (!date) {
      return res.status(400).json({ message: "date parameter is required" });
    }

    // First, get all columns from the table
    const [columns] = await pool.query(`SHOW COLUMNS FROM ledgers`);
    const columnNames = columns.map(col => col.Field);
    
    // Build SELECT clause dynamically based on existing columns
    const selectFields = ['id', 'entry_type', 'description', 'debit', 'credit', 'created_at as entry_date'];
    
    // Add optional fields if they exist
    const optionalFields = ['reference', 'reference_id', 'reference_table', 'customer_id', 'vehicle_id', 'owner_id'];
    optionalFields.forEach(field => {
      if (columnNames.includes(field)) {
        selectFields.push(field);
      }
    });
    
    const sql = `
      SELECT ${selectFields.join(', ')}
      FROM ledgers
      WHERE DATE(created_at) = ?
      ORDER BY created_at ASC
    `;

    const [rows] = await pool.query(sql, [date]);

    let total_debit = 0;
    let total_credit = 0;
    let running_balance = 0;

    const entries = rows.map(row => {
      const debit = Number(row.debit || 0);
      const credit = Number(row.credit || 0);
      running_balance = running_balance + debit - credit;
      
      total_debit += debit;
      total_credit += credit;
      
      return {
        ...row,
        debit,
        credit,
        running_balance,
        entry_date: row.entry_date
      };
    });

    // Get summary by entry type
    const [summary] = await pool.query(`
      SELECT 
        entry_type,
        SUM(debit) as total_debit,
        SUM(credit) as total_credit,
        COUNT(*) as entry_count
      FROM ledgers
      WHERE DATE(created_at) = ?
      GROUP BY entry_type
      ORDER BY entry_type
    `, [date]);

    res.json({
      date,
      summary: {
        total_debit,
        total_credit,
        net: total_debit - total_credit,
        total_entries: rows.length
      },
      by_type: summary.map(s => ({
        entry_type: s.entry_type,
        total_debit: Number(s.total_debit) || 0,
        total_credit: Number(s.total_credit) || 0,
        net: (Number(s.total_debit) || 0) - (Number(s.total_credit) || 0),
        entry_count: Number(s.entry_count) || 0
      })),
      entries
    });
  } catch (error) {
    console.error('Error in getDaybookDetailed:', error);
    res.status(500).json({ error: error.message });
  }
};

// ====================== LEDGER ACCOUNT SUMMARY ======================
export const getLedgerAccountSummary = async (req, res) => {
  try {
    const { from, to, account_type } = req.query;

    if (!from || !to) {
      return res.status(400).json({ message: "from & to dates required" });
    }

    let sql = `
      SELECT 
        entry_type,
        SUM(debit) as total_debit,
        SUM(credit) as total_credit,
        COUNT(*) as transaction_count,
        MIN(created_at) as first_transaction,
        MAX(created_at) as last_transaction
      FROM ledgers
      WHERE DATE(created_at) BETWEEN ? AND ?
    `;
    
    const params = [from, to];
    
    if (account_type) {
      sql += ` AND entry_type = ?`;
      params.push(account_type);
    }
    
    sql += ` GROUP BY entry_type ORDER BY entry_type`;

    const [rows] = await pool.query(sql, params);

    const summary = rows.map(row => ({
      account_type: row.entry_type,
      total_debit: Number(row.total_debit) || 0,
      total_credit: Number(row.total_credit) || 0,
      net_balance: (Number(row.total_debit) || 0) - (Number(row.total_credit) || 0),
      transaction_count: Number(row.transaction_count) || 0,
      first_transaction: row.first_transaction,
      last_transaction: row.last_transaction
    }));

    const total_debit_all = summary.reduce((sum, acc) => sum + acc.total_debit, 0);
    const total_credit_all = summary.reduce((sum, acc) => sum + acc.total_credit, 0);

    res.json({
      date_range: { from, to },
      summary,
      totals: {
        total_debit: total_debit_all,
        total_credit: total_credit_all,
        net_balance: total_debit_all - total_credit_all
      }
    });
  } catch (error) {
    console.error('Error in getLedgerAccountSummary:', error);
    res.status(500).json({ error: error.message });
  }
};

// ====================== GET LEDGER BY REFERENCE ======================
export const getLedgerByReference = async (req, res) => {
  try {
    const { reference_table, reference_id } = req.params;

    if (!reference_table || !reference_id) {
      return res.status(400).json({ 
        message: "reference_table and reference_id are required" 
      });
    }

    const [rows] = await pool.query(`
      SELECT 
        id,
        entry_type,
        description,
        debit,
        credit,
        created_at,
        reference,
        customer_id,
        vehicle_id,
        owner_id
      FROM ledgers
      WHERE reference_table = ? AND reference_id = ?
      ORDER BY created_at ASC
    `, [reference_table, reference_id]);

    let running_balance = 0;
    const entries = rows.map(row => {
      const debit = Number(row.debit || 0);
      const credit = Number(row.credit || 0);
      running_balance = running_balance + debit - credit;
      
      return {
        ...row,
        debit,
        credit,
        running_balance
      };
    });

    const total_debit = entries.reduce((sum, e) => sum + e.debit, 0);
    const total_credit = entries.reduce((sum, e) => sum + e.credit, 0);

    res.json({
      reference_table,
      reference_id,
      entries,
      summary: {
        total_debit,
        total_credit,
        net_balance: total_debit - total_credit,
        closing_balance: running_balance
      }
    });
  } catch (error) {
    console.error('Error in getLedgerByReference:', error);
    res.status(500).json({ error: error.message });
  }
};