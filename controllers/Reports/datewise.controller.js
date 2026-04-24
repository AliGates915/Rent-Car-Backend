// backend/controllers/Reports/reports.controller.js
import { pool } from "../../config/db.js";

// ====================== RECEIPTS REPORT ======================
export const getReceiptsReport = async (req, res) => {
  try {
    const { from, to } = req.query;

    if (!from || !to) {
      return res.status(400).json({ 
        message: "Both 'from' and 'to' dates are required" 
      });
    }

    const sql = `
      SELECT 
        cr.*,
        c.customer_name,
        b.booking_code,
        CASE 
          WHEN cr.source = 'booking' THEN 'Booking Payment'
          WHEN cr.customer_id IS NOT NULL THEN 'Customer Payment'
          ELSE 'General Receipt'
        END as receipt_type
      FROM cash_receipts cr
      LEFT JOIN customers c ON cr.customer_id = c.id
      LEFT JOIN bookings b ON cr.reference_id = b.id AND cr.source = 'booking'
      WHERE DATE(cr.created_at) BETWEEN ? AND ?
      ORDER BY cr.created_at DESC
    `;

    const [rows] = await pool.query(sql, [from, to]);

    // Calculate summary totals
    const summary = {
      total_receipts: rows.length,
      total_amount: rows.reduce((sum, row) => sum + (Number(row.amount) || 0), 0),
      by_payment_method: {},
      by_source: {
        booking: 0,
        customer: 0,
        general: 0
      }
    };

    rows.forEach(row => {
      // Group by payment method
      const method = row.payment_method || 'cash';
      if (!summary.by_payment_method[method]) {
        summary.by_payment_method[method] = {
          count: 0,
          total: 0
        };
      }
      summary.by_payment_method[method].count++;
      summary.by_payment_method[method].total += Number(row.amount) || 0;

      // Group by source
      if (row.source === 'booking') {
        summary.by_source.booking += Number(row.amount) || 0;
      } else if (row.customer_id) {
        summary.by_source.customer += Number(row.amount) || 0;
      } else {
        summary.by_source.general += Number(row.amount) || 0;
      }
    });

    // Format amounts as numbers
    const formattedRows = rows.map(row => ({
      ...row,
      amount: Number(row.amount) || 0
    }));

    res.json({
      date_range: { from, to },
      summary,
      receipts: formattedRows
    });
  } catch (error) {
    console.error('Error in getReceiptsReport:', error);
    res.status(500).json({ error: error.message });
  }
};

// ====================== EXPENSE REPORT ======================
export const getExpenseReport = async (req, res) => {
  try {
    const { from, to } = req.query;

    if (!from || !to) {
      return res.status(400).json({ 
        message: "Both 'from' and 'to' dates are required" 
      });
    }

    const sql = `
      SELECT 
        ev.*,
        CASE 
          WHEN ev.expense_type = 'maintenance' THEN 'Vehicle Maintenance'
          WHEN ev.expense_type = 'salary' THEN 'Staff Salary'
          WHEN ev.expense_type = 'rent' THEN 'Office Rent'
          WHEN ev.expense_type = 'utility' THEN 'Utility Bills'
          WHEN ev.expense_type = 'other' THEN 'Other Expenses'
          ELSE ev.expense_type
        END as expense_category
      FROM expense_vouchers ev
      WHERE DATE(ev.created_at) BETWEEN ? AND ?
      ORDER BY ev.created_at DESC
    `;

    const [rows] = await pool.query(sql, [from, to]);

    // Calculate summary totals
    const summary = {
      total_expenses: rows.length,
      total_amount: rows.reduce((sum, row) => sum + (Number(row.amount) || 0), 0),
      by_type: {},
      by_vendor: {},
      average_amount: 0
    };

    rows.forEach(row => {
      // Group by expense type
      const type = row.expense_type || 'other';
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

    summary.average_amount = summary.total_expenses > 0 
      ? summary.total_amount / summary.total_expenses 
      : 0;

    // Format amounts as numbers
    const formattedRows = rows.map(row => ({
      ...row,
      amount: Number(row.amount) || 0
    }));

    res.json({
      date_range: { from, to },
      summary,
      expenses: formattedRows
    });
  } catch (error) {
    console.error('Error in getExpenseReport:', error);
    res.status(500).json({ error: error.message });
  }
};

// ====================== PROFIT & LOSS REPORT ======================
export const getProfitLossReport = async (req, res) => {
  try {
    const { from, to } = req.query;

    if (!from || !to) {
      return res.status(400).json({ 
        message: "Both 'from' and 'to' dates are required" 
      });
    }

    // Get total revenue from booking payments
    const [revenueResult] = await pool.query(`
      SELECT 
        COALESCE(SUM(amount), 0) as total_revenue,
        COUNT(*) as total_transactions
      FROM booking_payments 
      WHERE payment_type IN ('advance', 'payment')
        AND DATE(created_at) BETWEEN ? AND ?
    `, [from, to]);

    // Get total expenses
    const [expenseResult] = await pool.query(`
      SELECT 
        COALESCE(SUM(amount), 0) as total_expenses,
        COUNT(*) as total_expense_transactions
      FROM expense_vouchers 
      WHERE DATE(created_at) BETWEEN ? AND ?
    `, [from, to]);

    // Get revenue by payment method
    const [revenueByMethod] = await pool.query(`
      SELECT 
        payment_method,
        COALESCE(SUM(amount), 0) as total
      FROM booking_payments 
      WHERE payment_type IN ('advance', 'payment')
        AND DATE(created_at) BETWEEN ? AND ?
      GROUP BY payment_method
    `, [from, to]);

    // Get expenses by type
    const [expensesByType] = await pool.query(`
      SELECT 
        expense_type,
        COALESCE(SUM(amount), 0) as total,
        COUNT(*) as count
      FROM expense_vouchers 
      WHERE DATE(created_at) BETWEEN ? AND ?
      GROUP BY expense_type
      ORDER BY total DESC
    `, [from, to]);

    const totalRevenue = Number(revenueResult[0]?.total_revenue) || 0;
    const totalExpenses = Number(expenseResult[0]?.total_expenses) || 0;
    const netProfit = totalRevenue - totalExpenses;

    res.json({
      date_range: { from, to },
      revenue: {
        total: totalRevenue,
        total_transactions: Number(revenueResult[0]?.total_transactions) || 0,
        by_payment_method: revenueByMethod.map(m => ({
          method: m.payment_method,
          amount: Number(m.total) || 0
        }))
      },
      expenses: {
        total: totalExpenses,
        total_transactions: Number(expenseResult[0]?.total_expense_transactions) || 0,
        by_type: expensesByType.map(e => ({
          type: e.expense_type,
          amount: Number(e.total) || 0,
          count: Number(e.count) || 0
        }))
      },
      profit_loss: {
        net_profit: netProfit,
        margin: totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0,
        is_profitable: netProfit > 0
      }
    });
  } catch (error) {
    console.error('Error in getProfitLossReport:', error);
    res.status(500).json({ error: error.message });
  }
};

// ====================== DAILY SUMMARY REPORT ======================
export const getDailySummaryReport = async (req, res) => {
  try {
    const { date } = req.query;

    if (!date) {
      return res.status(400).json({ 
        message: "Date parameter is required" 
      });
    }

    // Get daily revenue
    const [revenueResult] = await pool.query(`
      SELECT 
        COALESCE(SUM(amount), 0) as total_revenue,
        COUNT(*) as total_transactions,
        COALESCE(SUM(CASE WHEN payment_method = 'cash' THEN amount ELSE 0 END), 0) as cash_revenue,
        COALESCE(SUM(CASE WHEN payment_method IN ('bank', 'easypaisa', 'jazzcash') THEN amount ELSE 0 END), 0) as digital_revenue
      FROM booking_payments 
      WHERE payment_type IN ('advance', 'payment')
        AND DATE(created_at) = ?
    `, [date]);

    // Get daily expenses
    const [expenseResult] = await pool.query(`
      SELECT 
        COALESCE(SUM(amount), 0) as total_expenses,
        COUNT(*) as total_expense_transactions
      FROM expense_vouchers 
      WHERE DATE(created_at) = ?
    `, [date]);

    // Get daily receipts
    const [receiptResult] = await pool.query(`
      SELECT 
        COALESCE(SUM(amount), 0) as total_receipts,
        COUNT(*) as total_receipts_count
      FROM cash_receipts 
      WHERE DATE(created_at) = ?
    `, [date]);

    // Get daily bookings count
    const [bookingResult] = await pool.query(`
      SELECT 
        COUNT(*) as total_bookings,
        COALESCE(SUM(total_amount), 0) as total_booking_value
      FROM bookings 
      WHERE DATE(created_at) = ?
    `, [date]);

    const totalRevenue = Number(revenueResult[0]?.total_revenue) || 0;
    const totalExpenses = Number(expenseResult[0]?.total_expenses) || 0;
    const netCashflow = totalRevenue - totalExpenses;

    res.json({
      date: date,
      revenue: {
        total: totalRevenue,
        total_transactions: Number(revenueResult[0]?.total_transactions) || 0,
        cash: Number(revenueResult[0]?.cash_revenue) || 0,
        digital: Number(revenueResult[0]?.digital_revenue) || 0
      },
      expenses: {
        total: totalExpenses,
        total_transactions: Number(expenseResult[0]?.total_expense_transactions) || 0
      },
      receipts: {
        total: Number(receiptResult[0]?.total_receipts) || 0,
        total_transactions: Number(receiptResult[0]?.total_receipts_count) || 0
      },
      bookings: {
        total: Number(bookingResult[0]?.total_bookings) || 0,
        total_value: Number(bookingResult[0]?.total_booking_value) || 0
      },
      net_cashflow: netCashflow,
      cashflow_status: netCashflow >= 0 ? 'positive' : 'negative'
    });
  } catch (error) {
    console.error('Error in getDailySummaryReport:', error);
    res.status(500).json({ error: error.message });
  }
};

// ====================== TAX REPORT ======================
export const getTaxReport = async (req, res) => {
  try {
    const { from, to } = req.query;

    if (!from || !to) {
      return res.status(400).json({ 
        message: "Both 'from' and 'to' dates are required" 
      });
    }

    // Get total revenue for tax calculation
    const [revenueResult] = await pool.query(`
      SELECT 
        COALESCE(SUM(amount), 0) as total_revenue
      FROM booking_payments 
      WHERE payment_type IN ('advance', 'payment')
        AND DATE(created_at) BETWEEN ? AND ?
    `, [from, to]);

    // Get total expenses (tax deductible)
    const [expenseResult] = await pool.query(`
      SELECT 
        COALESCE(SUM(amount), 0) as total_expenses
      FROM expense_vouchers 
      WHERE DATE(created_at) BETWEEN ? AND ?
    `, [from, to]);

    const totalRevenue = Number(revenueResult[0]?.total_revenue) || 0;
    const totalExpenses = Number(expenseResult[0]?.total_expenses) || 0;
    const taxableIncome = totalRevenue - totalExpenses;

    const taxRate = 0.15; // 15% corporate tax rate (adjust as needed)
    const estimatedTax = taxableIncome * taxRate;

    res.json({
      date_range: { from, to },
      financial_summary: {
        total_revenue: totalRevenue,
        total_expenses: totalExpenses,
        taxable_income: taxableIncome
      },
      tax_calculation: {
        tax_rate_percentage: taxRate * 100,
        estimated_tax_liability: estimatedTax,
        notes: "Tax calculation is estimated. Consult with a tax professional for exact liability."
      }
    });
  } catch (error) {
    console.error('Error in getTaxReport:', error);
    res.status(500).json({ error: error.message });
  }
};

// ====================== CASH FLOW REPORT ======================
export const getCashFlowReport = async (req, res) => {
  try {
    const { from, to } = req.query;

    if (!from || !to) {
      return res.status(400).json({ 
        message: "Both 'from' and 'to' dates are required" 
      });
    }

    // Get daily cash flow
    const [dailyCashFlow] = await pool.query(`
      SELECT 
        DATE(created_at) as date,
        COALESCE(SUM(CASE WHEN payment_type IN ('advance', 'payment') THEN amount ELSE 0 END), 0) as inflow,
        COALESCE(SUM(CASE WHEN payment_type = 'security_deposit' THEN amount ELSE 0 END), 0) as deposit_inflow
      FROM booking_payments 
      WHERE DATE(created_at) BETWEEN ? AND ?
      GROUP BY DATE(created_at)
      ORDER BY date ASC
    `, [from, to]);

    // Get daily cash outflows (expenses)
    const [dailyOutflow] = await pool.query(`
      SELECT 
        DATE(created_at) as date,
        COALESCE(SUM(amount), 0) as outflow
      FROM expense_vouchers 
      WHERE DATE(created_at) BETWEEN ? AND ?
      GROUP BY DATE(created_at)
      ORDER BY date ASC
    `, [from, to]);

    // Combine inflow and outflow
    const cashFlowMap = new Map();
    
    dailyCashFlow.forEach(day => {
      cashFlowMap.set(day.date.toISOString().split('T')[0], {
        date: day.date,
        inflow: Number(day.inflow) || 0,
        deposit_inflow: Number(day.deposit_inflow) || 0,
        outflow: 0,
        net_flow: Number(day.inflow) || 0
      });
    });
    
    dailyOutflow.forEach(day => {
      const dateKey = day.date.toISOString().split('T')[0];
      if (cashFlowMap.has(dateKey)) {
        const existing = cashFlowMap.get(dateKey);
        existing.outflow = Number(day.outflow) || 0;
        existing.net_flow = existing.inflow - existing.outflow;
        cashFlowMap.set(dateKey, existing);
      } else {
        cashFlowMap.set(dateKey, {
          date: day.date,
          inflow: 0,
          deposit_inflow: 0,
          outflow: Number(day.outflow) || 0,
          net_flow: -Number(day.outflow) || 0
        });
      }
    });

    const cashFlowData = Array.from(cashFlowMap.values())
      .sort((a, b) => new Date(a.date) - new Date(b.date));

    // Calculate running balance
    let runningBalance = 0;
    const cashFlowWithBalance = cashFlowData.map(day => {
      runningBalance += day.net_flow;
      return { ...day, running_balance: runningBalance };
    });

    const totalInflow = cashFlowData.reduce((sum, day) => sum + day.inflow, 0);
    const totalOutflow = cashFlowData.reduce((sum, day) => sum + day.outflow, 0);
    const totalDepositInflow = cashFlowData.reduce((sum, day) => sum + day.deposit_inflow, 0);

    res.json({
      date_range: { from, to },
      summary: {
        total_inflow: totalInflow,
        total_outflow: totalOutflow,
        total_deposit_inflow: totalDepositInflow,
        net_cashflow: totalInflow - totalOutflow,
        closing_balance: runningBalance
      },
      daily_breakdown: cashFlowWithBalance
    });
  } catch (error) {
    console.error('Error in getCashFlowReport:', error);
    res.status(500).json({ error: error.message });
  }
};