// backend/controllers/ownerEarnings.controller.js
import { pool } from "../../config/db.js";
import { addLedgerEntry } from "../../utils/ledger.js";

// ✅ create owner earning when booking is completed + paid
export const createOwnerEarningFromBooking = async (req, res) => {
  try {
    const { booking_id } = req.body;

    if (!booking_id) {
      return res.status(400).json({ message: "booking_id is required" });
    }

    const sql = `
      SELECT 
        b.id AS booking_id,
        b.booking_code,
        b.vehicle_id,
        b.total_days,
        b.total_amount,
        b.status,
        b.payment_status,
        v.owner_id,
        v.owner_percentage
      FROM bookings b
      JOIN vehicles v ON b.vehicle_id = v.id
      WHERE b.id = ?
    `;

    const [rows] = await pool.query(sql, [booking_id]);
    
    if (!rows.length) {
      return res.status(404).json({ message: "Booking not found" });
    }

    const booking = rows[0];

    if (!booking.owner_id) {
      return res.status(400).json({ message: "This vehicle has no owner assigned" });
    }

    if (booking.status !== "completed") {
      return res.status(400).json({ message: "Booking is not completed yet" });
    }

    if (booking.payment_status !== "paid") {
      return res.status(400).json({ message: "Booking is not fully paid yet" });
    }

    // prevent duplicate earning
    const [existing] = await pool.query(
      `SELECT id FROM owner_earnings WHERE booking_id = ? LIMIT 1`,
      [booking_id]
    );

    if (existing.length > 0) {
      return res.status(400).json({ message: "Owner earning already created for this booking" });
    }

    const bookingAmount = Number(booking.total_amount || 0);
    const ownerPercentage = Number(booking.owner_percentage || 80);
    const ownerAmount = (bookingAmount * ownerPercentage) / 100;
    const companyAmount = bookingAmount - ownerAmount;

    const insertSql = `
      INSERT INTO owner_earnings
      (
        owner_id,
        vehicle_id,
        booking_id,
        booking_code,
        total_days,
        booking_amount,
        owner_percentage,
        owner_amount,
        company_amount,
        status
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'unpaid')
    `;

    const [result] = await pool.query(insertSql, [
      booking.owner_id,
      booking.vehicle_id,
      booking.booking_id,
      booking.booking_code,
      booking.total_days,
      bookingAmount,
      ownerPercentage,
      ownerAmount,
      companyAmount
    ]);

    await addLedgerEntry({
      entry_type: "owner",
      reference_id: result.insertId,
      reference_table: "owner_earnings",
      owner_id: booking.owner_id,
      credit: ownerAmount,
      description: `Owner earning for booking ${booking.booking_code}`
    });

    res.status(201).json({
      message: "Owner earning created successfully",
      id: result.insertId,
      owner_amount: ownerAmount,
      company_amount: companyAmount
    });
  } catch (error) {
    console.error('Error in createOwnerEarningFromBooking:', error);
    res.status(500).json({ error: error.message });
  }
};

// ✅ get all owner earnings
export const getOwnerEarnings = async (req, res) => {
  try {
    const { status, owner_id, from_date, to_date } = req.query;
    
    let sql = `
      SELECT 
        oe.*,
        vo.owner_name,
        v.registration_no,
        v.car_make,
        v.car_model
      FROM owner_earnings oe
      JOIN vehicle_owners vo ON oe.owner_id = vo.id
      JOIN vehicles v ON oe.vehicle_id = v.id
      WHERE 1=1
    `;
    
    const params = [];
    
    if (status) {
      sql += ` AND oe.status = ?`;
      params.push(status);
    }
    
    if (owner_id) {
      sql += ` AND oe.owner_id = ?`;
      params.push(owner_id);
    }
    
    if (from_date) {
      sql += ` AND DATE(oe.created_at) >= ?`;
      params.push(from_date);
    }
    
    if (to_date) {
      sql += ` AND DATE(oe.created_at) <= ?`;
      params.push(to_date);
    }
    
    sql += ` ORDER BY oe.id DESC`;

    const [rows] = await pool.query(sql, params);
    
    // Format numeric values
    const formattedRows = rows.map(row => ({
      ...row,
      total_days: Number(row.total_days) || 0,
      booking_amount: Number(row.booking_amount) || 0,
      owner_percentage: Number(row.owner_percentage) || 0,
      owner_amount: Number(row.owner_amount) || 0,
      company_amount: Number(row.company_amount) || 0
    }));
    
    res.json(formattedRows);
  } catch (error) {
    console.error('Error in getOwnerEarnings:', error);
    res.status(500).json({ error: error.message });
  }
};

// ✅ get owner earnings by owner
export const getOwnerEarningsByOwner = async (req, res) => {
  try {
    const { owner_id } = req.params;
    const { status, from_date, to_date } = req.query;

    let sql = `
      SELECT 
        oe.*,
        v.registration_no,
        v.car_make,
        v.car_model
      FROM owner_earnings oe
      JOIN vehicles v ON oe.vehicle_id = v.id
      WHERE oe.owner_id = ?
    `;
    
    const params = [owner_id];
    
    if (status) {
      sql += ` AND oe.status = ?`;
      params.push(status);
    }
    
    if (from_date) {
      sql += ` AND DATE(oe.created_at) >= ?`;
      params.push(from_date);
    }
    
    if (to_date) {
      sql += ` AND DATE(oe.created_at) <= ?`;
      params.push(to_date);
    }
    
    sql += ` ORDER BY oe.id DESC`;

    const [rows] = await pool.query(sql, params);
    
    // Format numeric values
    const formattedRows = rows.map(row => ({
      ...row,
      total_days: Number(row.total_days) || 0,
      booking_amount: Number(row.booking_amount) || 0,
      owner_percentage: Number(row.owner_percentage) || 0,
      owner_amount: Number(row.owner_amount) || 0,
      company_amount: Number(row.company_amount) || 0
    }));
    
    res.json(formattedRows);
  } catch (error) {
    console.error('Error in getOwnerEarningsByOwner:', error);
    res.status(500).json({ error: error.message });
  }
};

// ✅ owner summary
export const getOwnerSummary = async (req, res) => {
  try {
    const { owner_id } = req.params;

    const sql = `
      SELECT
        vo.id AS owner_id,
        vo.owner_name,
        vo.phone_no,
        vo.cnic_no,
        COUNT(DISTINCT v.id) AS total_vehicles,
        COUNT(DISTINCT oe.booking_id) AS completed_paid_bookings,
        COALESCE(SUM(oe.booking_amount), 0) AS total_booking_amount,
        COALESCE(SUM(oe.owner_amount), 0) AS total_owner_amount,
        COALESCE(SUM(oe.company_amount), 0) AS total_company_amount,
        COALESCE(SUM(CASE WHEN oe.status='unpaid' THEN oe.owner_amount ELSE 0 END), 0) AS unpaid_owner_amount,
        COALESCE(SUM(CASE WHEN oe.status='paid' THEN oe.owner_amount ELSE 0 END), 0) AS paid_owner_amount
      FROM vehicle_owners vo
      LEFT JOIN vehicles v ON v.owner_id = vo.id
      LEFT JOIN owner_earnings oe ON oe.owner_id = vo.id
      WHERE vo.id = ?
      GROUP BY vo.id, vo.owner_name, vo.phone_no, vo.cnic_no
    `;

    const [rows] = await pool.query(sql, [owner_id]);
    
    if (!rows.length) {
      return res.status(404).json({ message: "Owner not found" });
    }

    const summary = rows[0];
    
    // Format numeric values
    res.json({
      owner_id: summary.owner_id,
      owner_name: summary.owner_name,
      phone_no: summary.phone_no,
      cnic_no: summary.cnic_no,
      total_vehicles: Number(summary.total_vehicles) || 0,
      completed_paid_bookings: Number(summary.completed_paid_bookings) || 0,
      total_booking_amount: Number(summary.total_booking_amount) || 0,
      total_owner_amount: Number(summary.total_owner_amount) || 0,
      total_company_amount: Number(summary.total_company_amount) || 0,
      unpaid_owner_amount: Number(summary.unpaid_owner_amount) || 0,
      paid_owner_amount: Number(summary.paid_owner_amount) || 0
    });
  } catch (error) {
    console.error('Error in getOwnerSummary:', error);
    res.status(500).json({ error: error.message });
  }
};

// ✅ mark owner earning as paid
export const markOwnerEarningPaid = async (req, res) => {
  try {
    const { id } = req.params;
    const { payment_method, payment_reference, notes } = req.body;

    // Get earning details before updating
    const [earningRows] = await pool.query(
      `SELECT * FROM owner_earnings WHERE id = ?`,
      [id]
    );
    
    if (earningRows.length === 0) {
      return res.status(404).json({ message: "Owner earning not found" });
    }
    
    const earning = earningRows[0];
    
    if (earning.status === 'paid') {
      return res.status(400).json({ message: "Owner earning is already marked as paid" });
    }

    // Update the earning status
    const [result] = await pool.query(
      `UPDATE owner_earnings SET status = 'paid', paid_at = NOW() WHERE id = ?`,
      [id]
    );
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Owner earning not found" });
    }

    // Record payment in owner_payments table (if it exists)
    try {
      await pool.query(
        `INSERT INTO owner_payments 
         (owner_id, earning_id, amount, payment_method, payment_reference, notes, created_at)
         VALUES (?, ?, ?, ?, ?, ?, NOW())`,
        [earning.owner_id, id, earning.owner_amount, payment_method || 'cash', payment_reference || null, notes || null]
      );
    } catch (paymentError) {
      console.error('Error recording owner payment:', paymentError);
      // Don't fail the request if payment recording fails
    }

    // Add reverse ledger entry
    await addLedgerEntry({
      entry_type: "owner_payment",
      reference_id: id,
      reference_table: "owner_earnings",
      owner_id: earning.owner_id,
      debit: earning.owner_amount,
      description: `Owner earning paid for booking ${earning.booking_code}`
    });

    res.json({ 
      message: "Owner earning marked as paid",
      owner_amount: earning.owner_amount,
      paid_at: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error in markOwnerEarningPaid:', error);
    res.status(500).json({ error: error.message });
  }
};

// ✅ owner due report
export const getOwnerDueReport = async (req, res) => {
  try {
    const { min_amount, owner_id } = req.query;

    let sql = `
      SELECT
        vo.id AS owner_id,
        vo.owner_name,
        vo.phone_no,
        COUNT(oe.id) AS total_unpaid_bookings,
        COALESCE(SUM(oe.owner_amount), 0) AS total_unpaid_amount,
        GROUP_CONCAT(DISTINCT oe.booking_code) AS booking_codes
      FROM vehicle_owners vo
      JOIN owner_earnings oe ON oe.owner_id = vo.id
      WHERE oe.status = 'unpaid'
    `;
    
    const params = [];
    
    if (owner_id) {
      sql += ` AND vo.id = ?`;
      params.push(owner_id);
    }
    
    sql += ` GROUP BY vo.id, vo.owner_name, vo.phone_no`;
    
    if (min_amount) {
      sql += ` HAVING total_unpaid_amount >= ?`;
      params.push(min_amount);
    }
    
    sql += ` ORDER BY total_unpaid_amount DESC`;

    const [rows] = await pool.query(sql, params);
    
    const formattedRows = rows.map(row => ({
      owner_id: row.owner_id,
      owner_name: row.owner_name,
      phone_no: row.phone_no,
      total_unpaid_bookings: Number(row.total_unpaid_bookings) || 0,
      total_unpaid_amount: Number(row.total_unpaid_amount) || 0,
      booking_codes: row.booking_codes ? row.booking_codes.split(',') : []
    }));
    
    res.json(formattedRows);
  } catch (error) {
    console.error('Error in getOwnerDueReport:', error);
    res.status(500).json({ error: error.message });
  }
};

// ✅ get earning statistics
export const getEarningStatistics = async (req, res) => {
  try {
    const { year, month } = req.query;
    const currentYear = year || new Date().getFullYear();
    
    let dateCondition = `YEAR(oe.created_at) = ?`;
    const params = [currentYear];
    
    if (month) {
      dateCondition += ` AND MONTH(oe.created_at) = ?`;
      params.push(month);
    }
    
    // Overall statistics
    const [statsResult] = await pool.query(`
      SELECT 
        COUNT(*) as total_earnings,
        COALESCE(SUM(owner_amount), 0) as total_owner_amount,
        COALESCE(SUM(company_amount), 0) as total_company_amount,
        COALESCE(SUM(booking_amount), 0) as total_booking_amount,
        COALESCE(AVG(owner_amount), 0) as average_owner_amount,
        SUM(CASE WHEN status = 'paid' THEN 1 ELSE 0 END) as paid_count,
        SUM(CASE WHEN status = 'unpaid' THEN 1 ELSE 0 END) as unpaid_count,
        COALESCE(SUM(CASE WHEN status = 'paid' THEN owner_amount ELSE 0 END), 0) as paid_amount,
        COALESCE(SUM(CASE WHEN status = 'unpaid' THEN owner_amount ELSE 0 END), 0) as unpaid_amount
      FROM owner_earnings oe
      WHERE ${dateCondition}
    `, params);
    
    // Top owners by earnings
    const [topOwners] = await pool.query(`
      SELECT 
        vo.id,
        vo.owner_name,
        COUNT(oe.id) as total_earnings_count,
        COALESCE(SUM(oe.owner_amount), 0) as total_owner_amount,
        COALESCE(SUM(oe.company_amount), 0) as total_company_amount,
        SUM(CASE WHEN oe.status = 'unpaid' THEN oe.owner_amount ELSE 0 END) as unpaid_amount
      FROM owner_earnings oe
      JOIN vehicle_owners vo ON oe.owner_id = vo.id
      WHERE ${dateCondition}
      GROUP BY vo.id, vo.owner_name
      ORDER BY total_owner_amount DESC
      LIMIT 10
    `, params);
    
    // Monthly breakdown
    const [monthlyBreakdown] = await pool.query(`
      SELECT 
        MONTH(oe.created_at) as month,
        MONTHNAME(oe.created_at) as month_name,
        COUNT(*) as count,
        COALESCE(SUM(owner_amount), 0) as owner_amount,
        COALESCE(SUM(company_amount), 0) as company_amount,
        SUM(CASE WHEN status = 'paid' THEN owner_amount ELSE 0 END) as paid_amount,
        SUM(CASE WHEN status = 'unpaid' THEN owner_amount ELSE 0 END) as unpaid_amount
      FROM owner_earnings oe
      WHERE YEAR(oe.created_at) = ?
      GROUP BY MONTH(oe.created_at)
      ORDER BY month ASC
    `, [currentYear]);
    
    const stats = statsResult[0] || {};
    
    res.json({
      year: currentYear,
      month: month || null,
      summary: {
        total_earnings: Number(stats.total_earnings) || 0,
        total_booking_amount: Number(stats.total_booking_amount) || 0,
        total_owner_amount: Number(stats.total_owner_amount) || 0,
        total_company_amount: Number(stats.total_company_amount) || 0,
        average_owner_amount: Number(stats.average_owner_amount) || 0,
        paid_count: Number(stats.paid_count) || 0,
        unpaid_count: Number(stats.unpaid_count) || 0,
        paid_amount: Number(stats.paid_amount) || 0,
        unpaid_amount: Number(stats.unpaid_amount) || 0
      },
      top_owners: topOwners.map(owner => ({
        ...owner,
        total_earnings_count: Number(owner.total_earnings_count) || 0,
        total_owner_amount: Number(owner.total_owner_amount) || 0,
        total_company_amount: Number(owner.total_company_amount) || 0,
        unpaid_amount: Number(owner.unpaid_amount) || 0
      })),
      monthly_breakdown: monthlyBreakdown.map(month => ({
        month: month.month,
        month_name: month.month_name,
        count: Number(month.count) || 0,
        owner_amount: Number(month.owner_amount) || 0,
        company_amount: Number(month.company_amount) || 0,
        paid_amount: Number(month.paid_amount) || 0,
        unpaid_amount: Number(month.unpaid_amount) || 0
      }))
    });
  } catch (error) {
    console.error('Error in getEarningStatistics:', error);
    res.status(500).json({ error: error.message });
  }
};

// ✅ bulk mark earnings as paid
export const bulkMarkEarningsPaid = async (req, res) => {
  try {
    const { earning_ids, payment_method, notes } = req.body;
    
    if (!earning_ids || !earning_ids.length) {
      return res.status(400).json({ message: "earning_ids array is required" });
    }
    
    const placeholders = earning_ids.map(() => '?').join(',');
    
    // Get earning details before updating
    const [earnings] = await pool.query(
      `SELECT * FROM owner_earnings WHERE id IN (${placeholders}) AND status = 'unpaid'`,
      earning_ids
    );
    
    if (earnings.length === 0) {
      return res.status(404).json({ message: "No unpaid earnings found" });
    }
    
    // Update all selected earnings
    const [result] = await pool.query(
      `UPDATE owner_earnings SET status = 'paid', paid_at = NOW() WHERE id IN (${placeholders})`,
      earning_ids
    );
    
    // Record payments
    for (const earning of earnings) {
      try {
        await pool.query(
          `INSERT INTO owner_payments 
           (owner_id, earning_id, amount, payment_method, notes, created_at)
           VALUES (?, ?, ?, ?, ?, NOW())`,
          [earning.owner_id, earning.id, earning.owner_amount, payment_method || 'cash', notes || null]
        );
        
        // Add ledger entry for each payment
        await addLedgerEntry({
          entry_type: "owner_payment",
          reference_id: earning.id,
          reference_table: "owner_earnings",
          owner_id: earning.owner_id,
          debit: earning.owner_amount,
          description: `Bulk owner earning payment for booking ${earning.booking_code}`
        });
      } catch (error) {
        console.error('Error recording individual payment:', error);
      }
    }
    
    res.json({
      message: `${result.affectedRows} owner earnings marked as paid`,
      total_processed: result.affectedRows,
      total_amount: earnings.reduce((sum, e) => sum + Number(e.owner_amount), 0)
    });
  } catch (error) {
    console.error('Error in bulkMarkEarningsPaid:', error);
    res.status(500).json({ error: error.message });
  }
};