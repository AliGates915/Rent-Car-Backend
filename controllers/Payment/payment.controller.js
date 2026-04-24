// backend/controllers/bookingPayments.controller.js
import { pool } from "../../config/db.js";
import { createOwnerEarningIfEligible } from "../../utils/createOwnerEarning.js";
import { addLedgerEntry } from "../../utils/ledger.js";

// Helper function to update booking payment summary
export const updateBookingPaymentSummary = async (bookingId) => {
  try {
    const sumSql = `
      SELECT
        COALESCE(SUM(CASE WHEN payment_type = 'advance' THEN amount ELSE 0 END), 0) AS advance_amount,
        COALESCE(SUM(CASE WHEN payment_type = 'payment' THEN amount ELSE 0 END), 0) AS paid_amount,
        COALESCE(SUM(CASE WHEN payment_type = 'security_deposit' THEN amount ELSE 0 END), 0) AS deposit_amount
      FROM booking_payments
      WHERE booking_id = ?
    `;

    const [rows] = await pool.query(sumSql, [bookingId]);

    const advance = Number(rows[0].advance_amount || 0);
    const paid = Number(rows[0].paid_amount || 0);
    const deposit = Number(rows[0].deposit_amount || 0);

    const [bRows] = await pool.query(
      `SELECT total_amount, status FROM bookings WHERE id = ?`,
      [bookingId]
    );

    if (bRows.length === 0) {
      throw new Error("Booking not found");
    }

    const total = Number(bRows[0].total_amount || 0);
    const status = bRows[0].status;

    const remaining = total - (advance + paid);

    let payment_status = "unpaid";

    if (remaining === total) payment_status = "unpaid";
    else if (remaining > 0) payment_status = "partial";
    else if (remaining === 0) payment_status = "paid";

    await pool.query(
      `UPDATE bookings 
       SET advance_amount = ?, paid_amount = ?, payment_status = ? 
       WHERE id = ?`,
      [advance, paid, payment_status, bookingId]
    );

    // 🔥 AUTO OWNER EARNING
    await createOwnerEarningIfEligible(bookingId);

    return { advance, paid, deposit, payment_status, remaining };
  } catch (error) {
    console.error('Error in updateBookingPaymentSummary:', error);
    throw error;
  }
};

// 🔥 ADD PAYMENT
export const addPayment = async (req, res) => {
  try {
    const {
      booking_id,
      payment_type,
      amount,
      payment_method = "cash",
      notes = null,
    } = req.body;

    if (!booking_id || !payment_type || !amount) {
      return res
        .status(400)
        .json({ message: "booking_id, payment_type, amount are required" });
    }

    // Get booking details
    const [bookingRows] = await pool.query(`SELECT * FROM bookings WHERE id = ?`, [booking_id]);
    
    if (bookingRows.length === 0) {
      return res.status(404).json({ message: "Booking not found" });
    }

    const booking = bookingRows[0];

    const total = Number(booking.total_amount || 0);
    const advance = Number(booking.advance_amount || 0);
    const paid = Number(booking.paid_amount || 0);

    const remaining = total - (advance + paid);
    const payAmount = Number(amount);

    // ❌ OVERPAYMENT CHECK
    if (payment_type === "payment" && payAmount > remaining) {
      return res.status(400).json({
        message: `Payment exceeds remaining amount. Remaining = ${remaining}`,
      });
    }

    // ❌ ALREADY PAID
    if (remaining <= 0 && payment_type === "payment") {
      return res.status(400).json({
        message: "Payment already completed",
      });
    }

    // ❌ ADVANCE LIMIT
    if (payment_type === "advance" && advance + payAmount > total) {
      return res.status(400).json({
        message: "Advance cannot exceed total amount",
      });
    }

    const insertSql = `
      INSERT INTO booking_payments
      (booking_id, payment_type, amount, payment_method, notes)
      VALUES (?, ?, ?, ?, ?)
    `;

    const [result] = await pool.query(insertSql, [
      booking_id, 
      payment_type, 
      payAmount, 
      payment_method, 
      notes
    ]);

    // Update booking payment summary
    const summary = await updateBookingPaymentSummary(booking_id);

    // Update customer balance (decrease outstanding amount)
    await pool.query(
      `UPDATE customers SET balance = balance - ? WHERE id = ?`,
      [payAmount, booking.customer_id]
    );

    // Add ledger entry
    await addLedgerEntry({
      entry_type: "payment",
      reference_id: result.insertId,
      reference_table: "booking_payments",
      customer_id: booking.customer_id,
      vehicle_id: booking.vehicle_id,
      debit: payAmount,
      description: `Booking payment - ${payment_type} for booking ${booking.booking_code}`
    });

    // Get updated booking details
    const [updatedRows] = await pool.query(`SELECT * FROM bookings WHERE id = ?`, [booking_id]);
    const updated = updatedRows[0];

    const remaining_after = Number(updated.total_amount) - (Number(updated.advance_amount) + Number(updated.paid_amount));

    res.status(201).json({
      message: "Payment added successfully",
      payment_id: result.insertId,
      remaining_after_payment: remaining_after,
      payment_status: updated.payment_status,
      summary: summary
    });
  } catch (error) {
    console.error('Error in addPayment:', error);
    res.status(500).json({ error: error.message });
  }
};

// 🔥 GET PAYMENTS BY BOOKING
export const getPaymentsByBooking = async (req, res) => {
  try {
    const { booking_id } = req.params;

    const [rows] = await pool.query(
      `SELECT * FROM booking_payments WHERE booking_id = ? ORDER BY id DESC`,
      [booking_id]
    );

    // Format amounts as numbers
    const formattedRows = rows.map(row => ({
      ...row,
      amount: Number(row.amount) || 0
    }));

    res.json(formattedRows);
  } catch (error) {
    console.error('Error in getPaymentsByBooking:', error);
    res.status(500).json({ error: error.message });
  }
};

// 🔥 GET ALL PAYMENTS (with filters)
export const getAllPayments = async (req, res) => {
  try {
    const { 
      start_date, 
      end_date, 
      payment_type, 
      payment_method,
      customer_id,
      booking_id,
      limit = 100,
      page = 1
    } = req.query;
    
    const offset = (parseInt(page) - 1) * parseInt(limit);
    
    let sql = `
      SELECT 
        bp.*,
        b.booking_code,
        c.customer_name,
        c.phone_no as customer_phone,
        v.registration_no,
        v.car_make,
        v.car_model
      FROM booking_payments bp
      JOIN bookings b ON bp.booking_id = b.id
      JOIN customers c ON b.customer_id = c.id
      LEFT JOIN vehicles v ON b.vehicle_id = v.id
      WHERE 1=1
    `;
    
    const params = [];
    
    if (start_date) {
      sql += ` AND DATE(bp.created_at) >= ?`;
      params.push(start_date);
    }
    
    if (end_date) {
      sql += ` AND DATE(bp.created_at) <= ?`;
      params.push(end_date);
    }
    
    if (payment_type) {
      sql += ` AND bp.payment_type = ?`;
      params.push(payment_type);
    }
    
    if (payment_method) {
      sql += ` AND bp.payment_method = ?`;
      params.push(payment_method);
    }
    
    if (customer_id) {
      sql += ` AND b.customer_id = ?`;
      params.push(customer_id);
    }
    
    if (booking_id) {
      sql += ` AND bp.booking_id = ?`;
      params.push(booking_id);
    }
    
    sql += ` ORDER BY bp.created_at DESC LIMIT ? OFFSET ?`;
    params.push(parseInt(limit), offset);
    
    const [rows] = await pool.query(sql, params);
    
    // Get total count for pagination
    let countSql = `
      SELECT COUNT(*) as total
      FROM booking_payments bp
      JOIN bookings b ON bp.booking_id = b.id
      WHERE 1=1
    `;
    
    const countParams = [];
    
    if (start_date) {
      countSql += ` AND DATE(bp.created_at) >= ?`;
      countParams.push(start_date);
    }
    
    if (end_date) {
      countSql += ` AND DATE(bp.created_at) <= ?`;
      countParams.push(end_date);
    }
    
    if (payment_type) {
      countSql += ` AND bp.payment_type = ?`;
      countParams.push(payment_type);
    }
    
    if (customer_id) {
      countSql += ` AND b.customer_id = ?`;
      countParams.push(customer_id);
    }
    
    if (booking_id) {
      countSql += ` AND bp.booking_id = ?`;
      countParams.push(booking_id);
    }
    
    const [countResult] = await pool.query(countSql, countParams);
    const total = countResult[0]?.total || 0;
    
    const formattedRows = rows.map(row => ({
      ...row,
      amount: Number(row.amount) || 0
    }));
    
    res.json({
      data: formattedRows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Error in getAllPayments:', error);
    res.status(500).json({ error: error.message });
  }
};

// 🔥 GET PAYMENT SUMMARY
export const getPaymentSummary = async (req, res) => {
  try {
    const { booking_id } = req.params;
    
    const [rows] = await pool.query(`
      SELECT 
        bp.booking_id,
        b.booking_code,
        b.total_amount,
        b.advance_amount,
        b.paid_amount,
        b.payment_status as booking_payment_status,
        COALESCE(SUM(CASE WHEN bp.payment_type = 'advance' THEN bp.amount ELSE 0 END), 0) as total_advance,
        COALESCE(SUM(CASE WHEN bp.payment_type = 'payment' THEN bp.amount ELSE 0 END), 0) as total_payment,
        COALESCE(SUM(CASE WHEN bp.payment_type = 'security_deposit' THEN bp.amount ELSE 0 END), 0) as total_deposit,
        COUNT(CASE WHEN bp.payment_type = 'advance' THEN 1 END) as advance_count,
        COUNT(CASE WHEN bp.payment_type = 'payment' THEN 1 END) as payment_count,
        COUNT(CASE WHEN bp.payment_type = 'security_deposit' THEN 1 END) as deposit_count
      FROM booking_payments bp
      JOIN bookings b ON bp.booking_id = b.id
      WHERE bp.booking_id = ?
      GROUP BY bp.booking_id
    `, [booking_id]);
    
    if (rows.length === 0) {
      const [bookingRows] = await pool.query(
        `SELECT booking_code, total_amount, advance_amount, paid_amount, payment_status FROM bookings WHERE id = ?`,
        [booking_id]
      );
      
      if (bookingRows.length === 0) {
        return res.status(404).json({ message: "Booking not found" });
      }
      
      const booking = bookingRows[0];
      return res.json({
        booking_id: parseInt(booking_id),
        booking_code: booking.booking_code,
        total_amount: Number(booking.total_amount) || 0,
        advance_amount: Number(booking.advance_amount) || 0,
        paid_amount: Number(booking.paid_amount) || 0,
        booking_payment_status: booking.payment_status,
        total_advance: 0,
        total_payment: 0,
        total_deposit: 0,
        advance_count: 0,
        payment_count: 0,
        deposit_count: 0,
        remaining_amount: Number(booking.total_amount) - (Number(booking.advance_amount) + Number(booking.paid_amount))
      });
    }
    
    const summary = rows[0];
    const remaining = Number(summary.total_amount) - (Number(summary.advance_amount) + Number(summary.paid_amount));
    
    res.json({
      booking_id: summary.booking_id,
      booking_code: summary.booking_code,
      total_amount: Number(summary.total_amount),
      advance_amount: Number(summary.advance_amount),
      paid_amount: Number(summary.paid_amount),
      booking_payment_status: summary.booking_payment_status,
      total_advance: Number(summary.total_advance),
      total_payment: Number(summary.total_payment),
      total_deposit: Number(summary.total_deposit),
      advance_count: Number(summary.advance_count),
      payment_count: Number(summary.payment_count),
      deposit_count: Number(summary.deposit_count),
      remaining_amount: remaining
    });
  } catch (error) {
    console.error('Error in getPaymentSummary:', error);
    res.status(500).json({ error: error.message });
  }
};

// 🔥 DELETE PAYMENT (admin use only)
export const deletePayment = async (req, res) => {
  try {
    const { id } = req.params;

    // Get payment details before deletion
    const [paymentRows] = await pool.query(
      `SELECT * FROM booking_payments WHERE id = ?`,
      [id]
    );
    
    if (paymentRows.length === 0) {
      return res.status(404).json({ message: "Payment not found" });
    }

    const payment = paymentRows[0];
    const booking_id = payment.booking_id;

    // Get booking details to update customer balance
    const [bookingRows] = await pool.query(
      `SELECT customer_id, booking_code FROM bookings WHERE id = ?`,
      [booking_id]
    );
    
    if (bookingRows.length > 0) {
      const booking = bookingRows[0];
      
      // Reverse customer balance (add back the amount)
      await pool.query(
        `UPDATE customers SET balance = balance + ? WHERE id = ?`,
        [Number(payment.amount), booking.customer_id]
      );
      
      // Add reversal ledger entry
      await addLedgerEntry({
        entry_type: "payment_deleted",
        reference_id: id,
        reference_table: "booking_payments",
        customer_id: booking.customer_id,
        credit: Number(payment.amount),
        description: `Payment deleted for booking ${booking.booking_code}`
      });
    }

    // Delete the payment
    await pool.query(`DELETE FROM booking_payments WHERE id = ?`, [id]);

    // Update booking payment summary
    await updateBookingPaymentSummary(booking_id);

    res.json({ 
      message: "Payment deleted successfully",
      deleted_payment: {
        id: payment.id,
        amount: payment.amount,
        payment_type: payment.payment_type
      }
    });
  } catch (error) {
    console.error('Error in deletePayment:', error);
    res.status(500).json({ error: error.message });
  }
};

// 🔥 GET PAYMENT STATISTICS
export const getPaymentStatistics = async (req, res) => {
  try {
    const { start_date, end_date } = req.query;
    
    let dateCondition = "WHERE 1=1";
    const params = [];
    
    if (start_date && end_date) {
      dateCondition += ` AND DATE(bp.created_at) BETWEEN ? AND ?`;
      params.push(start_date, end_date);
    }
    
    const [rows] = await pool.query(`
      SELECT 
        COUNT(*) as total_transactions,
        COALESCE(SUM(amount), 0) as total_amount,
        COALESCE(SUM(CASE WHEN payment_type = 'advance' THEN amount ELSE 0 END), 0) as total_advance,
        COALESCE(SUM(CASE WHEN payment_type = 'payment' THEN amount ELSE 0 END), 0) as total_payment,
        COALESCE(SUM(CASE WHEN payment_type = 'security_deposit' THEN amount ELSE 0 END), 0) as total_deposit,
        COUNT(CASE WHEN payment_type = 'advance' THEN 1 END) as advance_count,
        COUNT(CASE WHEN payment_type = 'payment' THEN 1 END) as payment_count,
        COUNT(CASE WHEN payment_type = 'security_deposit' THEN 1 END) as deposit_count,
        COALESCE(AVG(amount), 0) as average_amount,
        COALESCE(MAX(amount), 0) as max_amount,
        COALESCE(MIN(amount), 0) as min_amount,
        SUM(CASE WHEN payment_method = 'cash' THEN amount ELSE 0 END) as cash_total,
        SUM(CASE WHEN payment_method = 'bank' THEN amount ELSE 0 END) as bank_total,
        SUM(CASE WHEN payment_method = 'easypaisa' THEN amount ELSE 0 END) as easypaisa_total,
        SUM(CASE WHEN payment_method = 'jazzcash' THEN amount ELSE 0 END) as jazzcash_total
      FROM booking_payments bp
      ${dateCondition}
    `, params);
    
    const stats = rows[0] || {};
    
    res.json({
      total_transactions: Number(stats.total_transactions) || 0,
      total_amount: Number(stats.total_amount) || 0,
      total_advance: Number(stats.total_advance) || 0,
      total_payment: Number(stats.total_payment) || 0,
      total_deposit: Number(stats.total_deposit) || 0,
      advance_count: Number(stats.advance_count) || 0,
      payment_count: Number(stats.payment_count) || 0,
      deposit_count: Number(stats.deposit_count) || 0,
      average_amount: Number(stats.average_amount) || 0,
      max_amount: Number(stats.max_amount) || 0,
      min_amount: Number(stats.min_amount) || 0,
      payment_methods: {
        cash: Number(stats.cash_total) || 0,
        bank: Number(stats.bank_total) || 0,
        easypaisa: Number(stats.easypaisa_total) || 0,
        jazzcash: Number(stats.jazzcash_total) || 0
      }
    });
  } catch (error) {
    console.error('Error in getPaymentStatistics:', error);
    res.status(500).json({ error: error.message });
  }
};