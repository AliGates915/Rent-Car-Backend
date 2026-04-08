// backend/controllers/Return_Vehicle/return.controller.js
import { db } from "../../config/db.js";
import { createOwnerEarningIfEligible } from "../../utils/createOwnerEarning.js";
import { addLedgerEntry } from "../../utils/ledger.js";

// GET all returns with pagination and filters
export const getReturns = (req, res) => {
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
      vh.handover_datetime
      
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

  db.query(sql, params, (err, rows) => {
    if (err) {
      console.error('Query error:', err);
      return res.status(500).json({ error: err.message });
    }

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

    db.query(countSql, countParams, (err, countResult) => {
      if (err) {
        console.error('Count error:', err);
        return res.status(500).json({ error: err.message });
      }

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
    });
  });
};

// CREATE return - FIXED without deposit_refund
export const returnVehicle = (req, res) => {
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
  db.query(
    `SELECT b.*, v.owner_id, v.owner_percentage 
     FROM bookings b 
     JOIN vehicles v ON b.vehicle_id = v.id 
     WHERE b.id = ? AND b.status = 'ongoing'`,
    [booking_id],
    (err, result) => {
      if (err) {
        console.error('Error fetching booking:', err);
        return res.status(500).json({ error: err.message });
      }
      if (result.length === 0) {
        return res.status(404).json({ message: "Ongoing booking not found" });
      }

      const booking = result[0];
      
      // Get total paid from booking
      const total_paid = parseFloat(booking.advance_amount || 0) + parseFloat(booking.paid_amount || 0);
      
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
        late_charges = late_days * dailyRate * 1.5;
      }
      
      // Calculate final amounts
      const base_amount = Number(booking.total_amount || 0);
      const final_amount = base_amount + Number(extra_charges) + Number(damage_charges) + late_charges;
      const balance_amount = final_amount - total_paid;
      
      // Insert return record (without deposit_refund)
      const insertReturn = `
        INSERT INTO vehicle_return
        (booking_id, vehicle_id, return_date, total_days, late_days, 
         extra_charges, damage_charges, final_amount, paid_amount, 
         balance_amount, notes, returned_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;

      db.query(insertReturn, [
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
      ], (err3, insertResult) => {
        if (err3) {
          console.error('Error inserting return:', err3);
          return res.status(500).json({ error: err3.message });
        }

        // Update booking status to completed
        db.query(`UPDATE bookings SET status='completed', updated_at=NOW() WHERE id=?`, [booking_id], (updateErr) => {
          if (updateErr) console.error('Error updating booking status:', updateErr);
        });
        
        // Update vehicle status to available
        db.query(`UPDATE vehicles SET status='available' WHERE id=?`, [booking.vehicle_id], (vehicleErr) => {
          if (vehicleErr) console.error('Error updating vehicle status:', vehicleErr);
        });

        // Update customer balance
        db.query(
          `UPDATE customers SET balance = balance - ? + ? WHERE id=?`,
          [final_amount, total_paid, booking.customer_id],
          (balanceErr) => {
            if (balanceErr) console.error('Error updating customer balance:', balanceErr);
          }
        );

        // Add ledger entry
        addLedgerEntry({
          entry_type: "return",
          reference_id: booking_id,
          reference_table: "vehicle_return",
          vehicle_id: booking.vehicle_id,
          customer_id: booking.customer_id,
          description: `Vehicle returned - Booking ${booking.booking_code}`,
        });

        // Create owner earning entry if eligible (booking completed and payment paid)
        createOwnerEarningIfEligible(booking_id);

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
            balance_due: balance_amount
          }
        });
      });
    }
  );
};

// Get pending returns
export const getPendingReturns = (req, res) => {
  const { page = 1, limit = 10, search } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);
  
  const sql = `
    SELECT 
      vh.id as handover_id,
      vh.booking_id,
      vh.vehicle_id,
      vh.handed_over_by,
      vh.handover_datetime,
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
    
    ${search ? `AND (
      b.booking_code LIKE ? OR 
      c.customer_name LIKE ? OR 
      v.registration_no LIKE ?
    )` : ''}
    
    ORDER BY vh.handover_datetime DESC
    LIMIT ? OFFSET ?
  `;
  
  const params = [];
  if (search) {
    const searchPattern = `%${search}%`;
    params.push(searchPattern, searchPattern, searchPattern);
  }
  params.push(parseInt(limit), offset);
  
  db.query(sql, params, (err, rows) => {
    if (err) {
      console.error('Error fetching pending returns:', err);
      return res.status(500).json({ error: err.message });
    }
    
    res.json({
      success: true,
      data: rows,
      message: `${rows.length} vehicles pending return`
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
      c.phone_no as customer_phone
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

// UPDATE return
export const updateReturn = (req, res) => {
  const { id } = req.params;
  const { 
    extra_charges, 
    damage_charges, 
    notes,
    returned_by 
  } = req.body;

  db.query(`SELECT * FROM vehicle_return WHERE id = ?`, [id], (err, result) => {
    if (err) return res.status(500).json({ error: err.message });
    if (result.length === 0) {
      return res.status(404).json({ message: "Return record not found" });
    }

    const existing = result[0];
    
    const updateSql = `
      UPDATE vehicle_return 
      SET extra_charges = COALESCE(?, extra_charges),
          damage_charges = COALESCE(?, damage_charges),
          notes = COALESCE(?, notes),
          returned_by = COALESCE(?, returned_by),
          final_amount = ?,
          balance_amount = ?
      WHERE id = ?
    `;

    const newExtra = extra_charges || existing.extra_charges;
    const newDamage = damage_charges || existing.damage_charges;
    const newFinal = existing.final_amount - existing.extra_charges - existing.damage_charges + newExtra + newDamage;
    const newBalance = newFinal - existing.paid_amount;

    db.query(updateSql, [
      newExtra,
      newDamage,
      notes || existing.notes,
      returned_by || existing.returned_by,
      newFinal,
      newBalance,
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