import { pool } from "../../config/db.js";
import { addLedgerEntry } from "../../utils/ledger.js";

// ====================== HELPER FUNCTIONS ======================

// Helper function to update customer balance
const updateCustomerBalance = async (customer_id) => {
  try {
    const [result] = await pool.query(`
      SELECT 
        COALESCE(SUM(b.total_amount - COALESCE(bp.total_paid, 0)), 0) as total_outstanding
      FROM bookings b
      LEFT JOIN (
        SELECT booking_id, SUM(amount) as total_paid
        FROM booking_payments
        WHERE payment_type IN ('advance', 'payment')
        GROUP BY booking_id
      ) bp ON b.id = bp.booking_id
      WHERE b.customer_id = ? AND b.status IN ('ongoing', 'completed')
    `, [customer_id]);

    const totalOutstanding = Number(result[0]?.total_outstanding) || 0;
    
    await pool.query(`UPDATE customers SET balance = ? WHERE id = ?`, [totalOutstanding, customer_id]);
    return totalOutstanding;
  } catch (error) {
    console.error('Error updating customer balance:', error);
    throw error;
  }
};

// Helper function to update booking payment summary
const updateBookingPaymentSummary = async (bookingId) => {
  try {
    const [paymentResult] = await pool.query(`
      SELECT 
        COALESCE(SUM(CASE WHEN payment_type IN ('advance', 'payment') THEN amount ELSE 0 END), 0) as total_paid,
        COALESCE(SUM(CASE WHEN payment_type = 'security_deposit' THEN amount ELSE 0 END), 0) as total_deposit
      FROM booking_payments WHERE booking_id = ?
    `, [bookingId]);

    const [bookingRows] = await pool.query(
      `SELECT total_amount FROM bookings WHERE id = ?`,
      [bookingId]
    );

    if (!bookingRows.length) throw new Error("Booking not found");

    const totalPaid = Number(paymentResult[0]?.total_paid || 0);
    const totalAmount = Number(bookingRows[0].total_amount);
    const paymentStatus = totalPaid >= totalAmount ? 'paid' : totalPaid > 0 ? 'partial' : 'unpaid';

    await pool.query(
      `UPDATE bookings SET paid_amount = ?, payment_status = ?, updated_at = NOW() WHERE id = ?`,
      [totalPaid, paymentStatus, bookingId]
    );

    return { totalPaid, paymentStatus, totalDeposit: Number(paymentResult[0]?.total_deposit || 0) };
  } catch (error) {
    console.error('Error updating booking payment summary:', error);
    throw error;
  }
};

// Helper function to update owner earnings
const updateOwnerAndCompanyEarnings = async (bookingId, paymentAmount) => {
  try {
    const [earningsRows] = await pool.query(`
      SELECT oe.* FROM owner_earnings oe
      WHERE oe.booking_id = ? AND oe.status = 'unpaid'
    `, [bookingId]);

    if (earningsRows.length === 0) return { message: "No unpaid earnings found" };

    const earnings = earningsRows[0];
    let remainingCompany = Number(earnings.company_amount);
    let remainingOwner = Number(earnings.owner_amount);
    let remainingPayment = paymentAmount;
    
    const companyPaid = Math.min(remainingPayment, remainingCompany);
    remainingCompany -= companyPaid;
    remainingPayment -= companyPaid;
    
    const ownerPaid = Math.min(remainingPayment, remainingOwner);
    remainingOwner -= ownerPaid;
    
    const newStatus = (remainingOwner === 0 && remainingCompany === 0) ? 'paid' : 'unpaid';

    await pool.query(
      `UPDATE owner_earnings SET owner_amount = ?, company_amount = ?, status = ?, updated_at = NOW() WHERE id = ?`,
      [remainingOwner, remainingCompany, newStatus, earnings.id]
    );

    return { companyPaid, ownerPaid, remainingCompanyAmount: remainingCompany, remainingOwnerAmount: remainingOwner, status: newStatus };
  } catch (error) {
    console.error('Error updating owner earnings:', error);
    throw error;
  }
};

// ====================== CUSTOMER BALANCE ENDPOINTS ======================

export const getCustomerWithBalance = async (req, res) => {
  try {
    const { customer_id } = req.params;

    const [customerRows] = await pool.query(
      `SELECT id, customer_name, phone_no, cnic_no, address, balance FROM customers WHERE id = ?`,
      [customer_id]
    );

    if (!customerRows.length) {
      return res.status(404).json({ success: false, message: "Customer not found" });
    }

    const [bookings] = await pool.query(`
      SELECT 
        b.id, b.booking_code, b.date_from, b.date_to, b.total_amount,
        b.advance_amount, b.paid_amount, b.security_deposit, b.payment_status,
        b.status as booking_status, b.created_at, v.registration_no,
        (b.total_amount - b.paid_amount) as remaining_amount,
        oe.id as earning_id, oe.owner_amount, oe.company_amount, oe.status as earnings_status
      FROM bookings b
      INNER JOIN vehicles v ON b.vehicle_id = v.id
      LEFT JOIN owner_earnings oe ON b.id = oe.booking_id
      WHERE b.customer_id = ?
      ORDER BY b.created_at DESC
    `, [customer_id]);

    const summary = {
      total_bookings: bookings.length,
      total_booking_amount: bookings.reduce((sum, b) => sum + (Number(b.total_amount) || 0), 0),
      total_paid: bookings.reduce((sum, b) => sum + (Number(b.paid_amount) || 0), 0),
      total_remaining: bookings.reduce((sum, b) => sum + (Number(b.remaining_amount) || 0), 0),
      payment_status_breakdown: {
        paid: bookings.filter(b => b.payment_status === 'paid').length,
        partial: bookings.filter(b => b.payment_status === 'partial').length,
        unpaid: bookings.filter(b => b.payment_status === 'unpaid').length
      }
    };

    res.json({
      success: true,
      customer: {
        id: customerRows[0].id,
        customer_name: customerRows[0].customer_name,
        phone_no: customerRows[0].phone_no,
        cnic_no: customerRows[0].cnic_no,
        address: customerRows[0].address,
        balance: Number(customerRows[0].balance) || 0
      },
      bookings: bookings.map(b => ({
        id: b.id, booking_code: b.booking_code, date_from: b.date_from, date_to: b.date_to,
        total_amount: Number(b.total_amount) || 0, advance_amount: Number(b.advance_amount) || 0,
        paid_amount: Number(b.paid_amount) || 0, remaining_amount: Number(b.remaining_amount) || 0,
        security_deposit: Number(b.security_deposit) || 0, payment_status: b.payment_status,
        booking_status: b.booking_status, registration_no: b.registration_no,
        owner_earnings: b.earning_id ? {
          id: b.earning_id, owner_amount: Number(b.owner_amount) || 0,
          company_amount: Number(b.company_amount) || 0, status: b.earnings_status
        } : null
      })),
      summary
    });
  } catch (error) {
    console.error('Error in getCustomerWithBalance:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

export const getAllCustomersWithBalance = async (req, res) => {
  try {
    const { search } = req.query;

    let sql = `
      SELECT 
        c.id, c.customer_name, c.phone_no, c.cnic_no, c.address, COALESCE(c.balance, 0) as balance,
        COUNT(DISTINCT b.id) as total_bookings,
        COALESCE(SUM(b.total_amount), 0) as total_booking_amount,
        COALESCE(SUM(b.paid_amount), 0) as total_paid_amount,
        COALESCE(SUM(b.total_amount - b.paid_amount), 0) as total_remaining_amount,
        SUM(CASE WHEN b.payment_status = 'paid' THEN 1 ELSE 0 END) as paid_bookings,
        SUM(CASE WHEN b.payment_status = 'partial' THEN 1 ELSE 0 END) as partial_bookings,
        SUM(CASE WHEN b.payment_status = 'unpaid' THEN 1 ELSE 0 END) as unpaid_bookings,
        COALESCE(SUM(oe.owner_amount), 0) as total_owner_due,
        COALESCE(SUM(oe.company_amount), 0) as total_company_due
      FROM customers c
      LEFT JOIN bookings b ON c.id = b.customer_id AND b.status IN ('ongoing', 'completed')
      LEFT JOIN owner_earnings oe ON b.id = oe.booking_id AND oe.status = 'unpaid'
      WHERE 1=1
    `;

    const params = [];
    if (search) {
      sql += ` AND (c.customer_name LIKE ? OR c.phone_no LIKE ? OR c.cnic_no LIKE ?)`;
      const pattern = `%${search}%`;
      params.push(pattern, pattern, pattern);
    }

    sql += ` GROUP BY c.id HAVING balance > 0 OR total_remaining_amount > 0 ORDER BY balance DESC, total_remaining_amount DESC`;

    const [rows] = await pool.query(sql, params);
    res.json({ success: true, data: rows.map(row => ({ ...row, balance: Number(row.balance) || 0 })) });
  } catch (error) {
    console.error('Error in getAllCustomersWithBalance:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// ====================== RECEIPT CRUD OPERATIONS ======================

export const addReceipt = async (req, res) => {
  try {
    const { amount, source, reference_id, payment_method, notes, customer_id } = req.body;
    if (!amount) return res.status(400).json({ success: false, message: "Amount required" });

    // Customer-based receipt
    if (customer_id) {
      const [bookings] = await pool.query(`
        SELECT id as booking_id FROM bookings 
        WHERE customer_id = ? AND payment_status IN ('unpaid', 'partial')
        ORDER BY created_at ASC
      `, [customer_id]);

      let remainingAmount = Number(amount);
      const processedBookings = [];

      for (const booking of bookings) {
        if (remainingAmount <= 0) break;

        const [paymentResult] = await pool.query(
          `SELECT COALESCE(SUM(amount), 0) as total_paid FROM booking_payments 
           WHERE booking_id = ? AND payment_type IN ('advance', 'payment')`,
          [booking.booking_id]
        );

        const [bookingResult] = await pool.query(`SELECT total_amount FROM bookings WHERE id = ?`, [booking.booking_id]);
        if (!bookingResult.length) continue;

        const outstanding = Number(bookingResult[0].total_amount) - Number(paymentResult[0].total_paid);
        if (outstanding <= 0) continue;

        const paymentAmount = Math.min(remainingAmount, outstanding);

        await pool.query(
          `INSERT INTO booking_payments (booking_id, payment_type, amount, payment_method, notes, created_at)
           VALUES (?, 'payment', ?, ?, ?, NOW())`,
          [booking.booking_id, paymentAmount, payment_method, `Payment towards booking - ${notes || ''}`]
        );

        await updateBookingPaymentSummary(booking.booking_id);
        const distribution = await updateOwnerAndCompanyEarnings(booking.booking_id, paymentAmount);

        processedBookings.push({ booking_id: booking.booking_id, amount: paymentAmount, ...distribution });
        remainingAmount -= paymentAmount;
      }

      const [result] = await pool.query(
        `INSERT INTO cash_receipts (amount, source, reference_id, payment_method, notes, customer_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, NOW())`,
        [amount, source, reference_id || null, payment_method, notes, customer_id]
      );

      await updateCustomerBalance(customer_id);

      return res.json({ success: true, message: "Receipt added", receipt_id: result.insertId, payments_processed: processedBookings, remaining_amount: remainingAmount });
    }
    
    // Booking-based receipt
    if (source === "booking" && reference_id) {
      const [bRows] = await pool.query(`SELECT * FROM bookings WHERE id = ?`, [reference_id]);
      if (!bRows.length) return res.status(404).json({ success: false, message: "Booking not found" });

      const booking = bRows[0];
      const remaining = Number(booking.total_amount) - Number(booking.paid_amount);
      const payAmount = Number(amount);

      if (payAmount > remaining) {
        return res.status(400).json({ success: false, message: `Amount exceeds remaining amount (${remaining})` });
      }

      const [result] = await pool.query(
        `INSERT INTO cash_receipts (amount, source, reference_id, payment_method, notes, customer_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, NOW())`,
        [payAmount, source, reference_id, payment_method, notes, booking.customer_id]
      );

      await pool.query(
        `INSERT INTO booking_payments (booking_id, payment_type, amount, payment_method, notes, created_at)
         VALUES (?, 'payment', ?, ?, ?, NOW())`,
        [reference_id, payAmount, payment_method, notes]
      );

      await updateBookingPaymentSummary(reference_id);
      await updateCustomerBalance(booking.customer_id);
      const distribution = await updateOwnerAndCompanyEarnings(reference_id, payAmount);

      return res.json({ success: true, message: "Receipt added", receipt_id: result.insertId, earnings_distribution: distribution });
    }

    // General receipt
    const [result] = await pool.query(
      `INSERT INTO cash_receipts (amount, source, reference_id, payment_method, notes, customer_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, NOW())`,
      [amount, source, reference_id || null, payment_method, notes, null]
    );

    res.json({ success: true, message: "General receipt added", id: result.insertId });
  } catch (error) {
    console.error('Error in addReceipt:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// ====================== RECEIPT RETRIEVAL ENDPOINTS ======================

export const getReceipts = async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT cr.*, c.customer_name,
        CASE 
          WHEN cr.source = 'booking' AND cr.reference_id IS NOT NULL THEN CONCAT('Booking #', cr.reference_id)
          WHEN cr.customer_id IS NOT NULL THEN c.customer_name
          ELSE cr.source
        END as received_from,
        CASE 
          WHEN cr.source = 'booking' THEN 'Booking Payment'
          WHEN cr.customer_id IS NOT NULL THEN 'Customer Payment'
          ELSE 'General Receipt'
        END as head
      FROM cash_receipts cr
      LEFT JOIN customers c ON cr.customer_id = c.id
      ORDER BY cr.id DESC
    `);
    res.json(rows);
  } catch (error) {
    console.error('Error in getReceipts:', error);
    res.status(500).json({ error: error.message });
  }
};

export const getReceiptById = async (req, res) => {
  try {
    const { id } = req.params;
    const [rows] = await pool.query(`SELECT * FROM cash_receipts WHERE id = ?`, [id]);
    if (!rows.length) return res.status(404).json({ message: "Not found" });
    res.json(rows[0]);
  } catch (error) {
    console.error('Error in getReceiptById:', error);
    res.status(500).json({ error: error.message });
  }
};

// ====================== RECEIPT UPDATE & DELETE ======================

export const updateReceipt = async (req, res) => {
  try {
    const { id } = req.params;
    const { amount, source, reference_id, payment_method, notes } = req.body;

    const [rows] = await pool.query(`SELECT * FROM cash_receipts WHERE id = ?`, [id]);
    if (!rows.length) return res.status(404).json({ message: "Receipt not found" });

    const oldReceipt = rows[0];
    const diff = Number(amount) - Number(oldReceipt.amount);

    await pool.query(
      `UPDATE cash_receipts SET amount = ?, source = ?, reference_id = ?, payment_method = ?, notes = ? WHERE id = ?`,
      [amount, source, reference_id, payment_method, notes, id]
    );

    if (oldReceipt.source === "booking" && oldReceipt.reference_id) {
      await pool.query(
        `UPDATE booking_payments SET amount = ?, payment_method = ?, notes = ? 
         WHERE booking_id = ? AND payment_type = 'payment' ORDER BY id DESC LIMIT 1`,
        [amount, payment_method, notes, oldReceipt.reference_id]
      );
      await updateBookingPaymentSummary(oldReceipt.reference_id);
      
      const [bRows] = await pool.query(`SELECT customer_id FROM bookings WHERE id = ?`, [oldReceipt.reference_id]);
      if (bRows.length) await updateCustomerBalance(bRows[0].customer_id);
      if (diff !== 0) await updateOwnerAndCompanyEarnings(oldReceipt.reference_id, diff);
    } else if (oldReceipt.customer_id) {
      await updateCustomerBalance(oldReceipt.customer_id);
    }

    res.json({ success: true, message: "Receipt updated successfully" });
  } catch (error) {
    console.error('Error in updateReceipt:', error);
    res.status(500).json({ error: error.message });
  }
};

export const deleteReceipt = async (req, res) => {
  try {
    const { id } = req.params;
    const [rows] = await pool.query(`SELECT * FROM cash_receipts WHERE id = ?`, [id]);
    if (!rows.length) return res.status(404).json({ message: "Receipt not found" });

    const receipt = rows[0];
    const amount = Number(receipt.amount);

    if (receipt.source === "booking" && receipt.reference_id) {
      await pool.query(
        `DELETE FROM booking_payments WHERE booking_id = ? AND payment_type = 'payment' AND amount = ? ORDER BY id DESC LIMIT 1`,
        [receipt.reference_id, amount]
      );
      await updateBookingPaymentSummary(receipt.reference_id);
      
      const [bRows] = await pool.query(`SELECT customer_id FROM bookings WHERE id = ?`, [receipt.reference_id]);
      if (bRows.length) {
        await updateCustomerBalance(bRows[0].customer_id);
        await updateOwnerAndCompanyEarnings(receipt.reference_id, -amount);
      }
    } else if (receipt.customer_id) {
      await pool.query(`UPDATE customers SET balance = balance + ? WHERE id = ?`, [amount, receipt.customer_id]);
    }

    await pool.query(`DELETE FROM cash_receipts WHERE id = ?`, [id]);
    res.json({ success: true, message: "Receipt deleted successfully" });
  } catch (error) {
    console.error('Error in deleteReceipt:', error);
    res.status(500).json({ error: error.message });
  }
};

// ====================== RECEIPT REPORTS ======================

export const getReceiptReport = async (req, res) => {
  try {
    const { start_date, end_date, page = 1, limit = 10 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let whereClause = "";
    const params = [];
    if (start_date && end_date) {
      whereClause = " WHERE DATE(cr.created_at) BETWEEN ? AND ?";
      params.push(start_date, end_date);
    }

    const [countResult] = await pool.query(`SELECT COUNT(*) as total FROM cash_receipts cr ${whereClause}`, params);
    const [rows] = await pool.query(`
      SELECT cr.*, c.customer_name, DATE(cr.created_at) as receipt_date
      FROM cash_receipts cr LEFT JOIN customers c ON cr.customer_id = c.id
      ${whereClause} ORDER BY cr.created_at DESC LIMIT ? OFFSET ?
    `, [...params, parseInt(limit), offset]);

    res.json({ data: rows, total: countResult[0]?.total || 0, page: parseInt(page), limit: parseInt(limit) });
  } catch (error) {
    console.error('Error in getReceiptReport:', error);
    res.status(500).json({ error: error.message });
  }
};

export const getReceiptSummary = async (req, res) => {
  try {
    const { start_date, end_date } = req.query;
    let whereClause = "";
    const params = [];
    if (start_date && end_date) {
      whereClause = " WHERE DATE(created_at) BETWEEN ? AND ?";
      params.push(start_date, end_date);
    }

    const [rows] = await pool.query(`
      SELECT 
        COUNT(*) as total_count, SUM(amount) as total_amount,
        SUM(CASE WHEN payment_method = 'cash' THEN amount ELSE 0 END) as cash_total,
        SUM(CASE WHEN payment_method = 'bank' THEN amount ELSE 0 END) as bank_total,
        SUM(CASE WHEN payment_method = 'easypaisa' THEN amount ELSE 0 END) as easypaisa_total,
        SUM(CASE WHEN payment_method = 'jazzcash' THEN amount ELSE 0 END) as jazzcash_total,
        AVG(amount) as average_amount
      FROM cash_receipts ${whereClause}
    `, params);
    res.json(rows[0]);
  } catch (error) {
    console.error('Error in getReceiptSummary:', error);
    res.status(500).json({ error: error.message });
  }
};

// GET raw receipt report data
export const getReceiptReportData = async (req, res) => {
  try {
    console.log("Fetching raw receipt report data...");

    const { start_date, end_date } = req.query;

    let query = `
      SELECT 
        cr.*,
        c.customer_name as customer_name,
        DATE(cr.created_at) as receipt_date
      FROM cash_receipts cr
      LEFT JOIN customers c ON cr.customer_id = c.id
    `;

    const params = [];

    // Add date filter ONLY if both dates are provided
    if (start_date && end_date) {
      query += ` WHERE DATE(cr.created_at) BETWEEN ? AND ?`;
      params.push(start_date, end_date);
    }

    query += ` ORDER BY cr.created_at DESC`;

    const [rows] = await pool.query(query, params);
    res.json(rows);
  } catch (error) {
    console.error('Error in getReceiptReportData:', error);
    res.status(500).json({ error: error.message });
  }
};

// GET receipt report with flexible date filtering
export const getReceiptReportDataFlexible = async (req, res) => {
  try {
    console.log("Fetching raw receipt report data with flexible date filtering...");

    const { start_date, end_date } = req.query;

    let query = `
      SELECT 
        cr.*,
        c.customer_name as customer_name,
        DATE(cr.created_at) as receipt_date
      FROM cash_receipts cr
      LEFT JOIN customers c ON cr.customer_id = c.id
    `;

    const conditions = [];
    const params = [];

    // Handle different date scenarios
    if (start_date && end_date) {
      conditions.push(`DATE(cr.created_at) BETWEEN ? AND ?`);
      params.push(start_date, end_date);
    } else if (start_date) {
      conditions.push(`DATE(cr.created_at) >= ?`);
      params.push(start_date);
    } else if (end_date) {
      conditions.push(`DATE(cr.created_at) <= ?`);
      params.push(end_date);
    }

    // Add WHERE clause if there are conditions
    if (conditions.length > 0) {
      query += ` WHERE ` + conditions.join(' AND ');
    }

    query += ` ORDER BY cr.created_at DESC`;

    const [rows] = await pool.query(query, params);
    res.json(rows);
  } catch (error) {
    console.error('Error in getReceiptReportDataFlexible:', error);
    res.status(500).json({ error: error.message });
  }
};

// GET receipts by specific date range
export const getReceiptsByDateRange = async (req, res) => {
  try {
    const { from, to } = req.query;

    if (!from || !to) {
      return res.status(400).json({ message: "From and To dates are required" });
    }

    const query = `
      SELECT 
        cr.*,
        c.customer_name as customer_name,
        DATE(cr.created_at) as receipt_date
      FROM cash_receipts cr
      LEFT JOIN customers c ON cr.customer_id = c.id
      WHERE DATE(cr.created_at) BETWEEN ? AND ?
      ORDER BY cr.created_at DESC
    `;

    const [rows] = await pool.query(query, [from, to]);
    res.json(rows);
  } catch (error) {
    console.error('Error in getReceiptsByDateRange:', error);
    res.status(500).json({ error: error.message });
  }
};


// GET grouped receipts by date
export const getReceiptsGrouped = async (req, res) => {
  try {
    const { start_date, end_date, group_by = 'day' } = req.query;

    let dateFormat;
    switch (group_by) {
      case 'week':
        dateFormat = 'YEARWEEK(created_at)';
        break;
      case 'month':
        dateFormat = 'DATE_FORMAT(created_at, "%Y-%m")';
        break;
      default:
        dateFormat = 'DATE(created_at)';
    }

    const query = `
      SELECT 
        ${dateFormat} as period,
        COUNT(*) as count,
        SUM(amount) as total,
        SUM(CASE WHEN payment_method = 'cash' THEN amount ELSE 0 END) as cash_total,
        SUM(CASE WHEN payment_method = 'bank' THEN amount ELSE 0 END) as bank_total,
        SUM(CASE WHEN payment_method = 'easypaisa' THEN amount ELSE 0 END) as easypaisa_total,
        SUM(CASE WHEN payment_method = 'jazzcash' THEN amount ELSE 0 END) as jazzcash_total,
        MIN(DATE(created_at)) as period_start
      FROM cash_receipts cr
      WHERE DATE(created_at) BETWEEN ? AND ?
      GROUP BY period
      ORDER BY period_start ASC
    `;

    const [rows] = await pool.query(query, [start_date, end_date]);
    res.json(rows);
  } catch (error) {
    console.error('Error in getReceiptsGrouped:', error);
    res.status(500).json({ error: error.message });
  }
};