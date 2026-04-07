// backend/controllers/Return_Vehicle/return.controller.js
import { db } from "../../config/db.js";
import { createOwnerEarningIfEligible } from "../../utils/createOwnerEarning.js";
import { addLedgerEntry } from "../../utils/ledger.js";

// GET all returns with pagination and filters
export const getReturns = (req, res) => {
  const { page = 1, limit = 10, search, booking_id, status } = req.query;
  const offset = (page - 1) * limit;

  let sql = `
    SELECT 
      vr.*,
      b.booking_code,
      b.customer_id,
      b.date_from,
      b.date_to,
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
    WHERE 1=1
  `;

  const params = [];

  if (booking_id) {
    sql += ` AND vr.booking_id = ?`;
    params.push(booking_id);
  }

  if (status) {
    sql += ` AND b.status = ?`;
    params.push(status);
  }

  if (search) {
    sql += ` AND (b.booking_code LIKE ? OR c.customer_name LIKE ? OR v.registration_no LIKE ?)`;
    const searchPattern = `%${search}%`;
    params.push(searchPattern, searchPattern, searchPattern);
  }

  // Get total count
  const countSql = `
    SELECT COUNT(*) as total
    FROM vehicle_return vr
    JOIN bookings b ON vr.booking_id = b.id
    WHERE 1=1
    ${booking_id ? ' AND vr.booking_id = ?' : ''}
    ${status ? ' AND b.status = ?' : ''}
  `;
  
  const countParams = booking_id ? [booking_id] : [];
  if (status) countParams.push(status);

  db.query(countSql, countParams, (err, countResult) => {
    if (err) {
      console.error('Count error:', err);
      return res.status(500).json({ error: err.message });
    }

    const total = countResult[0]?.total || 0;
    const totalPages = Math.ceil(total / limit);

    sql += ` ORDER BY vr.created_at DESC LIMIT ? OFFSET ?`;
    params.push(parseInt(limit), parseInt(offset));

    db.query(sql, params, (err, rows) => {
      if (err) {
        console.error('Query error:', err);
        return res.status(500).json({ error: err.message });
      }

      res.json({
        data: rows,
        meta: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          totalPages,
          hasNext: page < totalPages,
          hasPrev: page > 1
        }
      });
    });
  });
};

// GET single return by ID
export const getReturnById = (req, res) => {
  const { id } = req.params;

  const sql = `
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
      c.phone_no as customer_phone,
      c.email as customer_email
    FROM vehicle_return vr
    JOIN bookings b ON vr.booking_id = b.id
    JOIN vehicles v ON vr.vehicle_id = v.id
    JOIN customers c ON b.customer_id = c.id
    WHERE vr.id = ?
  `;

  db.query(sql, [id], (err, rows) => {
    if (err) {
      console.error('Query error:', err);
      return res.status(500).json({ error: err.message });
    }
    if (rows.length === 0) {
      return res.status(404).json({ message: 'Return record not found' });
    }
    res.json(rows[0]);
  });
};

// CREATE return (existing function)
// ====================== RETURN VEHICLE ======================
export const returnVehicle = (req, res) => {
  const { 
    booking_id, 
    extra_charges = 0, 
    damage_charges = 0, 
    notes,
    odometer_in,
    fuel_level_in,
    returned_by,
    refund_deposit = true  // Whether to refund security deposit
  } = req.body;

  // Get booking details
  db.query(
    `SELECT * FROM bookings WHERE id = ? AND status = 'ongoing'`,
    [booking_id],
    (err, result) => {
      if (err) return res.status(500).json(err);
      if (result.length === 0) {
        return res.status(404).json({ message: "Ongoing booking not found" });
      }

      const booking = result[0];
      
      // Get total paid from payments table (excluding security deposit)
      const paymentQuery = `
        SELECT 
          SUM(CASE WHEN payment_type = 'advance' OR payment_type = 'payment' THEN amount ELSE 0 END) as total_rental_paid,
          SUM(CASE WHEN payment_type = 'security_deposit' THEN amount ELSE 0 END) as deposit_collected
        FROM booking_payments
        WHERE booking_id = ?
      `;

      db.query(paymentQuery, [booking_id], (err2, payResult) => {
        if (err2) return res.status(500).json(err2);

        const total_rental_paid = Number(payResult[0]?.total_rental_paid || 0);
        const deposit_collected = Number(payResult[0]?.deposit_collected || 0);
        
        // Calculate late days
        let late_days = 0;
        let late_charges = 0;
        if (req.body.return_date) {
          const returnDate = new Date(req.body.return_date);
          const endDate = new Date(booking.date_to);
          if (returnDate > endDate) {
            late_days = Math.ceil((returnDate - endDate) / (1000 * 60 * 60 * 24));
            const dailyRate = Number(booking.rate_per_day || 0);
            late_charges = late_days * dailyRate * 1.5; // 50% extra for late return
          }
        }
        
        // Calculate final amounts
        const rental_amount = Number(booking.total_amount) - Number(booking.security_deposit);
        const final_rental = rental_amount + Number(extra_charges) + Number(damage_charges) + late_charges;
        const balance_rental = final_rental - total_rental_paid;
        
        // Security deposit refund (minus any damages)
        let deposit_refund = deposit_collected;
        if (damage_charges > 0) {
          deposit_refund = Math.max(0, deposit_collected - damage_charges);
        }
        
        const final_amount = final_rental; // Total amount due for rental
        const total_paid = total_rental_paid;
        const balance_amount = final_rental - total_rental_paid;

        // Insert return record
        const insertReturn = `
          INSERT INTO vehicle_return
          (booking_id, vehicle_id, return_date, total_days, late_days, 
           extra_charges, damage_charges, final_amount, paid_amount, 
           balance_amount, deposit_refund, notes, returned_by)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;

        const returnDate = req.body.return_date || new Date();

        db.query(insertReturn, [
          booking.id,
          booking.vehicle_id,
          returnDate,
          booking.total_days,
          late_days,
          extra_charges,
          damage_charges,
          final_rental,
          total_rental_paid,
          balance_amount,
          deposit_refund,
          notes || null,
          returned_by || null
        ], (err3, insertResult) => {
          if (err3) return res.status(500).json(err3);

          // Add extra/damage charges as payment entries
          if (extra_charges > 0) {
            db.query(
              `INSERT INTO booking_payments (booking_id, payment_type, amount, notes) 
               VALUES (?, 'extra_charges', ?, ?)`,
              [booking_id, extra_charges, 'Extra charges for vehicle return']
            );
          }

          if (damage_charges > 0) {
            db.query(
              `INSERT INTO booking_payments (booking_id, payment_type, amount, notes) 
               VALUES (?, 'damage_charges', ?, ?)`,
              [booking_id, damage_charges, 'Damage charges for vehicle return']
            );
          }

          // Record deposit refund if any
          if (refund_deposit && deposit_refund > 0) {
            db.query(
              `INSERT INTO booking_payments (booking_id, payment_type, amount, notes) 
               VALUES (?, 'deposit_refund', ?, 'Security deposit refund')`,
              [booking_id, deposit_refund]
            );
          }

          // Update booking status
          db.query(`UPDATE bookings SET status='completed' WHERE id=?`, [booking_id]);
          db.query(`UPDATE vehicles SET status='available' WHERE id=?`, [booking.vehicle_id]);

          // Update customer balance (only rental, deposit is separate)
          db.query(
            `UPDATE customers SET balance = balance - ? + ? WHERE id=?`,
            [final_rental, total_rental_paid, booking.customer_id]
          );

          addLedgerEntry({
            entry_type: "return",
            reference_id: booking_id,
            reference_table: "vehicle_return",
            vehicle_id: booking.vehicle_id,
            description: "Vehicle returned",
          });

          res.json({
            success: true,
            message: "Return completed successfully",
            return_id: insertResult.insertId,
            rental_amount,
            extra_charges,
            damage_charges,
            late_charges,
            late_days,
            final_rental,
            total_paid,
            balance_due: balance_amount,
            deposit_collected,
            deposit_refund,
            damage_deducted: damage_charges > 0 ? Math.min(damage_charges, deposit_collected) : 0
          });
        });
      });
    }
  );
};




// UPDATE return
export const updateReturn = (req, res) => {
  const { id } = req.params;
  const { 
    extra_charges, 
    damage_charges, 
    notes,
    odometer_in,
    fuel_level_in,
    returned_by 
  } = req.body;

  // First get the existing return record
  db.query(`SELECT * FROM vehicle_return WHERE id = ?`, [id], (err, result) => {
    if (err) return res.status(500).json({ error: err.message });
    if (result.length === 0) {
      return res.status(404).json({ message: "Return record not found" });
    }

    const existing = result[0];
    
    // Update the return record
    const updateSql = `
      UPDATE vehicle_return 
      SET extra_charges = COALESCE(?, extra_charges),
          damage_charges = COALESCE(?, damage_charges),
          notes = COALESCE(?, notes),
          returned_by = COALESCE(?, returned_by)
      WHERE id = ?
    `;

    db.query(updateSql, [
      extra_charges || existing.extra_charges,
      damage_charges || existing.damage_charges,
      notes || existing.notes,
      returned_by || existing.returned_by,
      id
    ], (err2) => {
      if (err2) return res.status(500).json({ error: err2.message });
      
      res.json({ success: true, message: "Return updated successfully" });
    });
  });
};

// DELETE return
export const deleteReturn = (req, res) => {
  const { id } = req.params;

  db.query(`DELETE FROM vehicle_return WHERE id = ?`, [id], (err, result) => {
    if (err) return res.status(500).json({ error: err.message });
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Return record not found" });
    }
    res.json({ success: true, message: "Return deleted successfully" });
  });
};