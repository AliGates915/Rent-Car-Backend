// backend/controllers/Return_Vehicle/return.controller.js
import { pool } from "../../config/db.js";
import { createOwnerEarningIfEligible } from "../../utils/createOwnerEarning.js";
import { addLedgerEntry } from "../../utils/ledger.js";

// GET all returns with pagination and filters
export const getReturns = async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 10, 
      search, 
      booking_id, 
      status = 'completed'
    } = req.query;
    
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let sql = `
      SELECT 
        vr.id,
        vr.booking_id,
        vr.vehicle_id,
        vr.return_date,
        vr.total_days,
        vr.late_days,
        vr.extra_charges,
        vr.damage_charges,
        vr.final_amount,
        vr.paid_amount,
        vr.balance_amount,
        vr.notes,
        vr.returned_by,
        vr.created_at,
        
        -- Booking details
        b.booking_code,
        b.customer_id,
        b.date_from,
        b.date_to,
        b.status as booking_status,
        b.total_amount,
        b.advance_amount,
        b.security_deposit,
        b.payment_status,
        
        -- Vehicle details
        v.registration_no,
        v.car_make,
        v.car_model,
        v.rate_per_day,
        v.transmission_type,
        v.fuel_type,
        
        -- Customer details
        c.customer_name,
        c.phone_no as customer_phone,
        c.cnic_no as customer_cnic,
        
        -- Handover details
        vh.km_out as handover_km,
        vh.fuel_level_out as handover_fuel,
        CONCAT(vh.handover_date, ' ', vh.handover_time) as handover_datetime
        
      FROM vehicle_return vr
      
      INNER JOIN bookings b ON vr.booking_id = b.id
      INNER JOIN vehicles v ON vr.vehicle_id = v.id
      INNER JOIN customers c ON b.customer_id = c.id
      LEFT JOIN vehicle_handover vh ON vr.booking_id = vh.booking_id
      
      WHERE 1=1
    `;

    const params = [];

    if (booking_id) {
      sql += ` AND vr.booking_id = ?`;
      params.push(booking_id);
    }

    if (status && status !== 'all') {
      sql += ` AND b.status = ?`;
      params.push(status);
    }

    if (search) {
      sql += ` AND (
        b.booking_code LIKE ? OR 
        c.customer_name LIKE ? OR 
        v.registration_no LIKE ? OR
        v.car_make LIKE ? OR
        v.car_model LIKE ?
      )`;
      const searchPattern = `%${search}%`;
      params.push(searchPattern, searchPattern, searchPattern, searchPattern, searchPattern);
    }

    sql += ` ORDER BY vr.return_date DESC, vr.created_at DESC`;
    sql += ` LIMIT ? OFFSET ?`;
    params.push(parseInt(limit), parseInt(offset));

    const [rows] = await pool.query(sql, params);

    const formattedRows = rows.map(row => ({
      id: row.id,
      booking_id: row.booking_id,
      vehicle_id: row.vehicle_id,
      return_date: row.return_date,
      total_days: row.total_days,
      late_days: parseInt(row.late_days) || 0,
      extra_charges: parseFloat(row.extra_charges) || 0,
      damage_charges: parseFloat(row.damage_charges) || 0,
      final_amount: parseFloat(row.final_amount) || 0,
      paid_amount: parseFloat(row.paid_amount) || 0,
      balance_amount: parseFloat(row.balance_amount) || 0,
      notes: row.notes,
      returned_by: row.returned_by,
      booking_code: row.booking_code,
      booking_status: row.booking_status,
      date_from: row.date_from,
      date_to: row.date_to,
      total_amount: parseFloat(row.total_amount) || 0,
      advance_amount: parseFloat(row.advance_amount) || 0,
      security_deposit: parseFloat(row.security_deposit) || 0,
      payment_status: row.payment_status,
      registration_no: row.registration_no,
      car_make: row.car_make,
      car_model: row.car_model,
      rate_per_day: parseFloat(row.rate_per_day) || 0,
      transmission_type: row.transmission_type,
      fuel_type: row.fuel_type,
      customer_name: row.customer_name,
      customer_phone: row.customer_phone,
      customer_cnic: row.customer_cnic,
      handover_km: parseInt(row.handover_km) || 0,
      handover_fuel: row.handover_fuel,
      handover_datetime: row.handover_datetime
    }));

    // Get total count for pagination
    let countSql = `SELECT COUNT(*) as total FROM vehicle_return vr JOIN bookings b ON vr.booking_id = b.id WHERE 1=1`;
    const countParams = [];

    if (booking_id) {
      countSql += ` AND vr.booking_id = ?`;
      countParams.push(booking_id);
    }

    if (status && status !== 'all') {
      countSql += ` AND b.status = ?`;
      countParams.push(status);
    }

    const [countResult] = await pool.query(countSql, countParams);
    const total = countResult[0]?.total || 0;
    const totalPages = Math.ceil(total / limit);

    res.json({
      success: true,
      data: formattedRows,
      pagination: {
        currentPage: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages,
        hasNext: parseInt(page) < totalPages,
        hasPrev: parseInt(page) > 1
      },
      summary: {
        total_returns: total,
        total_revenue: formattedRows.reduce((sum, row) => sum + (row.final_amount || 0), 0),
        total_paid: formattedRows.reduce((sum, row) => sum + (row.paid_amount || 0), 0),
        total_balance: formattedRows.reduce((sum, row) => sum + (row.balance_amount || 0), 0),
        total_extra_charges: formattedRows.reduce((sum, row) => sum + (row.extra_charges || 0), 0),
        total_damage_charges: formattedRows.reduce((sum, row) => sum + (row.damage_charges || 0), 0)
      }
    });
  } catch (error) {
    console.error('Error in getReturns:', error);
    res.status(500).json({ error: error.message });
  }
};

// Helper function to get total paid amount
const getTotalPaid = async (booking_id) => {
  const [result] = await pool.query(
    `SELECT SUM(amount) as total_paid 
     FROM booking_payments 
     WHERE booking_id = ? AND payment_type IN ('advance', 'payment')`,
    [booking_id]
  );
  return result[0]?.total_paid || 0;
};

// Helper function to get security deposit
const getSecurityDeposit = async (booking_id) => {
  const [result] = await pool.query(
    `SELECT SUM(amount) as deposit 
     FROM booking_payments 
     WHERE booking_id = ? AND payment_type = 'security_deposit'`,
    [booking_id]
  );
  return result[0]?.deposit || 0;
};

// CREATE return
export const returnVehicle = async (req, res) => {
  const connection = await pool.getConnection();
  
  try {
    await connection.beginTransaction();

    const { 
      booking_id, 
      return_date,
      odometer_in,
      fuel_level_in,
      extra_charges = 0, 
      damage_charges = 0, 
      damage_notes,
      notes,
      returned_by
    } = req.body;

    // Get booking details
    const [bookingResult] = await connection.query(
      `SELECT b.*, v.owner_id, v.owner_percentage, v.rate_per_day
       FROM bookings b 
       JOIN vehicles v ON b.vehicle_id = v.id 
       WHERE b.id = ? AND b.status = 'ongoing'`,
      [booking_id]
    );

    if (bookingResult.length === 0) {
      await connection.rollback();
      return res.status(404).json({ message: "Ongoing booking not found" });
    }

    const booking = bookingResult[0];
    
    // Get total paid and security deposit
    const total_paid = await getTotalPaid(booking_id);
    const security_deposit = await getSecurityDeposit(booking_id);
    
    // Calculate late days
    let late_days = 0;
    let late_charges = 0;
    const returnDate = new Date(return_date);
    const endDate = new Date(booking.date_to);
    
    returnDate.setHours(0, 0, 0, 0);
    endDate.setHours(0, 0, 0, 0);
    
    if (returnDate > endDate) {
      const diffTime = returnDate - endDate;
      late_days = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      const dailyRate = Number(booking.rate_per_day || 0);
      late_charges = late_days * dailyRate * 1.5; // 50% extra for late return
    }
    
    // Calculate final amounts
    const base_amount = Number(booking.total_amount || 0);
    const final_amount = base_amount + Number(extra_charges) + Number(damage_charges) + late_charges;
    const balance_amount = final_amount - total_paid;
    const deposit_refund = security_deposit - (Number(damage_charges) + Number(extra_charges));
    
    // Insert return record
    const [insertResult] = await connection.query(
      `INSERT INTO vehicle_return
       (booking_id, vehicle_id, return_date, total_days, late_days, 
        extra_charges, damage_charges, final_amount, paid_amount, 
        balance_amount, notes, returned_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        booking.id,
        booking.vehicle_id,
        return_date,
        booking.total_days,
        late_days,
        extra_charges,
        damage_charges,
        final_amount,
        total_paid,
        balance_amount,
        notes || null,
        returned_by || null
      ]
    );

    // Update booking status to completed
    await connection.query(
      `UPDATE bookings SET status='completed', payment_status=?, updated_at=NOW() WHERE id=?`,
      [balance_amount <= 0 ? 'paid' : 'partial', booking_id]
    );
    
    // Update vehicle status to available
    await connection.query(
      `UPDATE vehicles SET status='available' WHERE id=?`,
      [booking.vehicle_id]
    );

    // Update customer balance
    await connection.query(
      `UPDATE customers SET balance = balance + ? WHERE id=?`,
      [balance_amount, booking.customer_id]
    );

    // Add ledger entry for the return
    await addLedgerEntry({
      entry_type: "return",
      reference_id: insertResult.insertId,
      reference_table: "vehicle_return",
      vehicle_id: booking.vehicle_id,
      customer_id: booking.customer_id,
      amount: balance_amount,
      description: `Vehicle returned - Booking ${booking.booking_code} | Balance due: ${balance_amount}`
    });

    // If there's a deposit refund, create a negative payment record
    if (deposit_refund > 0) {
      await connection.query(
        `INSERT INTO booking_payments 
         (booking_id, payment_type, amount, payment_method, notes, created_at)
         VALUES (?, 'refund', ?, 'cash', ?, NOW())`,
        [booking_id, -deposit_refund, `Security deposit refund - Damage: ${damage_charges}, Extra: ${extra_charges}`]
      );
    }

    // Create owner earning entry if eligible
    await createOwnerEarningIfEligible(booking_id);

    await connection.commit();

    res.json({
      success: true,
      message: "Return completed successfully",
      return_id: insertResult.insertId,
      calculations: {
        base_amount,
        extra_charges,
        damage_charges,
        late_charges,
        late_days,
        final_amount,
        total_paid,
        balance_due: balance_amount,
        deposit_refund: deposit_refund > 0 ? deposit_refund : 0
      }
    });
  } catch (error) {
    await connection.rollback();
    console.error('Error in returnVehicle:', error);
    res.status(500).json({ error: error.message });
  } finally {
    connection.release();
  }
};

// Get pending returns
export const getPendingReturns = async (req, res) => {
  try {
    const { page = 1, limit = 10, search } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    
    let sql = `
      SELECT 
        vh.id as handover_id,
        vh.booking_id,
        vh.vehicle_id,
        vh.handed_over_by,
        CONCAT(vh.handover_date, ' ', vh.handover_time) as handover_datetime,
        vh.km_out,
        vh.fuel_level_out,
        
        b.booking_code,
        b.customer_id,
        b.date_from,
        b.date_to,
        b.status as booking_status,
        b.total_amount,
        b.advance_amount,
        b.paid_amount,
        b.security_deposit,
        
        v.registration_no,
        v.car_make,
        v.car_model,
        v.rate_per_day,
        
        c.customer_name,
        c.phone_no as customer_phone
        
      FROM vehicle_handover vh
      INNER JOIN bookings b ON vh.booking_id = b.id
      INNER JOIN vehicles v ON vh.vehicle_id = v.id
      INNER JOIN customers c ON b.customer_id = c.id
      LEFT JOIN vehicle_return vr ON vh.booking_id = vr.booking_id
      
      WHERE b.status = 'ongoing'
      AND vr.id IS NULL
    `;
    
    const params = [];
    
    if (search) {
      sql += ` AND (
        b.booking_code LIKE ? OR 
        c.customer_name LIKE ? OR 
        v.registration_no LIKE ?
      )`;
      const searchPattern = `%${search}%`;
      params.push(searchPattern, searchPattern, searchPattern);
    }
    
    sql += ` ORDER BY vh.handover_datetime DESC LIMIT ? OFFSET ?`;
    params.push(parseInt(limit), offset);
    
    const [rows] = await pool.query(sql, params);
    
    res.json({
      success: true,
      data: rows,
      message: `${rows.length} vehicles pending return`
    });
  } catch (error) {
    console.error('Error in getPendingReturns:', error);
    res.status(500).json({ error: error.message });
  }
};

// GET single return by ID
export const getReturnById = async (req, res) => {
  try {
    const { id } = req.params;

    const [rows] = await pool.query(`
      SELECT 
        vr.*,
        b.booking_code,
        b.customer_id,
        b.date_from,
        b.date_to,
        b.total_amount as booking_total,
        b.advance_amount,
        b.paid_amount as booking_paid,
        b.status as booking_status,
        v.registration_no,
        v.car_make,
        v.car_model,
        v.rate_per_day,
        c.customer_name,
        c.phone_no as customer_phone
      FROM vehicle_return vr
      JOIN bookings b ON vr.booking_id = b.id
      JOIN vehicles v ON vr.vehicle_id = v.id
      JOIN customers c ON b.customer_id = c.id
      WHERE vr.id = ?
    `, [id]);

    if (rows.length === 0) {
      return res.status(404).json({ message: 'Return record not found' });
    }
    
    res.json(rows[0]);
  } catch (error) {
    console.error('Error in getReturnById:', error);
    res.status(500).json({ error: error.message });
  }
};

// UPDATE return
export const updateReturn = async (req, res) => {
  try {
    const { id } = req.params;
    const { 
      extra_charges, 
      damage_charges, 
      notes,
      returned_by 
    } = req.body;

    const [existing] = await pool.query(`SELECT * FROM vehicle_return WHERE id = ?`, [id]);
    
    if (existing.length === 0) {
      return res.status(404).json({ message: "Return record not found" });
    }

    const existingRecord = existing[0];
    
    const newExtra = extra_charges !== undefined ? extra_charges : existingRecord.extra_charges;
    const newDamage = damage_charges !== undefined ? damage_charges : existingRecord.damage_charges;
    const newFinal = existingRecord.final_amount - existingRecord.extra_charges - existingRecord.damage_charges + newExtra + newDamage;
    const newBalance = newFinal - existingRecord.paid_amount;

    await pool.query(
      `UPDATE vehicle_return 
       SET extra_charges = ?,
           damage_charges = ?,
           notes = COALESCE(?, notes),
           returned_by = COALESCE(?, returned_by),
           final_amount = ?,
           balance_amount = ?
       WHERE id = ?`,
      [
        newExtra,
        newDamage,
        notes,
        returned_by,
        newFinal,
        newBalance,
        id
      ]
    );
    
    res.json({ success: true, message: "Return updated successfully" });
  } catch (error) {
    console.error('Error in updateReturn:', error);
    res.status(500).json({ error: error.message });
  }
};

// DELETE return
export const deleteReturn = async (req, res) => {
  try {
    const { id } = req.params;

    const [result] = await pool.query(`DELETE FROM vehicle_return WHERE id = ?`, [id]);
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Return record not found" });
    }
    
    res.json({ success: true, message: "Return deleted successfully" });
  } catch (error) {
    console.error('Error in deleteReturn:', error);
    res.status(500).json({ error: error.message });
  }
};

// GET return statistics
export const getReturnStatistics = async (req, res) => {
  try {
    const { from_date, to_date } = req.query;
    
    let dateCondition = "WHERE 1=1";
    const params = [];
    
    if (from_date && to_date) {
      dateCondition += ` AND DATE(vr.return_date) BETWEEN ? AND ?`;
      params.push(from_date, to_date);
    }
    
    const [stats] = await pool.query(`
      SELECT 
        COUNT(*) as total_returns,
        SUM(vr.final_amount) as total_revenue,
        SUM(vr.paid_amount) as total_paid,
        SUM(vr.balance_amount) as total_balance_due,
        SUM(vr.extra_charges) as total_extra_charges,
        SUM(vr.damage_charges) as total_damage_charges,
        SUM(vr.late_days) as total_late_days,
        AVG(vr.late_days) as avg_late_days,
        COUNT(CASE WHEN vr.late_days > 0 THEN 1 END) as late_returns_count,
        COUNT(CASE WHEN vr.balance_amount > 0 THEN 1 END) as pending_payment_count
      FROM vehicle_return vr
      ${dateCondition}
    `, params);
    
    const result = stats[0] || {};
    
    res.json({
      success: true,
      statistics: {
        total_returns: Number(result.total_returns) || 0,
        total_revenue: Number(result.total_revenue) || 0,
        total_paid: Number(result.total_paid) || 0,
        total_balance_due: Number(result.total_balance_due) || 0,
        total_extra_charges: Number(result.total_extra_charges) || 0,
        total_damage_charges: Number(result.total_damage_charges) || 0,
        total_late_days: Number(result.total_late_days) || 0,
        avg_late_days: Number(result.avg_late_days) || 0,
        late_returns_count: Number(result.late_returns_count) || 0,
        pending_payment_count: Number(result.pending_payment_count) || 0
      }
    });
  } catch (error) {
    console.error('Error in getReturnStatistics:', error);
    res.status(500).json({ error: error.message });
  }
};