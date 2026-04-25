// backend/controllers/Booking/booking.controller.js

import { pool } from "../../config/db.js";
import { addLedgerEntry } from "../../utils/ledger.js";

// Helper function to update vehicle status using async/await with better error handling
const updateVehicleStatus = async (vehicleId) => {
  try {
    const [result] = await pool.query(
      `SELECT COUNT(*) as active_count 
       FROM bookings 
       WHERE vehicle_id = ? 
       AND status IN ('confirmed', 'ongoing')
       AND date_to >= CURDATE()`,
      [vehicleId]
    );

    const hasActiveBookings = result[0]?.active_count > 0;
    const newStatus = hasActiveBookings ? 'booked' : 'available';

    await pool.query(`UPDATE vehicles SET status = ? WHERE id = ?`, [newStatus, vehicleId]);
    return newStatus;
  } catch (error) {
    console.error('Error updating vehicle status:', error);
    throw error;
  }
};


// Optimized check vehicle availability
const checkVehicleAvailability = async (vehicleId, dateFrom, dateTo, excludeBookingId = null) => {
  let checkSql = `
    SELECT id, booking_code, date_from, date_to, status 
    FROM bookings 
    WHERE vehicle_id = ?
    AND status IN ('confirmed', 'ongoing')
    AND NOT (date_to < ? OR date_from > ?)
  `;

  const params = [vehicleId, dateFrom, dateTo];

  if (excludeBookingId) {
    checkSql += ` AND id != ?`;
    params.push(excludeBookingId);
  }

  checkSql += ` ORDER BY date_from ASC`;

  const [rows] = await pool.query(checkSql, params);
  return rows || [];
};

// ====================== GET VEHICLE AVAILABILITY ======================
export const getVehicleAvailability = async (req, res) => {
  try {
    const { vehicle_id, date_from, date_to } = req.query;

    if (!vehicle_id || !date_from || !date_to) {
      return res.status(400).json({
        message: "Vehicle ID, start date and end date are required"
      });
    }

    const conflictingBookings = await checkVehicleAvailability(vehicle_id, date_from, date_to);

    const isAvailable = conflictingBookings.length === 0;

    res.json({
      success: true,
      vehicle_id: parseInt(vehicle_id),
      date_from,
      date_to,
      is_available: isAvailable,
      conflicting_bookings: conflictingBookings.map(b => ({
        id: b.id,
        booking_code: b.booking_code,
        date_from: b.date_from,
        date_to: b.date_to,
        status: b.status
      }))
    });
  } catch (error) {
    console.error('Error in getVehicleAvailability:', error);
    res.status(500).json({ error: error.message });
  }
};

// ====================== OPTIMIZED CREATE BOOKING ======================
export const createBooking = async (req, res) => {
  let {
    customer_id,
    vehicle_id,
    rent_type_id,
    date_from,
    date_to,
    pickup_city,
    dropoff_city,
    advance_amount = 0,
    security_deposit = 0,
    upfront_payment = 0,
    status
  } = req.body;

  if (!status || status === "" || status === null) {
    status = "pending";
  }

  if (!customer_id || !vehicle_id || !date_from || !date_to) {
    return res.status(400).json({ message: "Missing required fields" });
  }

  // Get a connection from the pool
  const connection = await pool.getConnection();
  
  try {
    // Start transaction
    await connection.beginTransaction();

    const cleanDateFrom = date_from.split("T")[0];
    const cleanDateTo = date_to.split("T")[0];

    const start = new Date(cleanDateFrom);
    const end = new Date(cleanDateTo);

    if (end < start) {
      await connection.rollback();
      return res.status(400).json({ message: "Invalid date range" });
    }

    // Check vehicle availability (using separate query outside transaction to avoid locks)
    const conflictingBookings = await checkVehicleAvailability(vehicle_id, cleanDateFrom, cleanDateTo);
    
    if (conflictingBookings.length > 0) {
      await connection.rollback();
      const conflicts = conflictingBookings.map(b =>
        `${b.booking_code} (${b.date_from} to ${b.date_to})`
      ).join(', ');

      return res.status(400).json({
        message: `Vehicle not available for selected dates. Conflicts with: ${conflicts}`,
        conflicts: conflictingBookings
      });
    }

    const days = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;

    // Get vehicle rate (outside transaction to avoid locks)
    const [vehicleRows] = await pool.query(`SELECT rate_per_day FROM vehicles WHERE id = ?`, [vehicle_id]);
    
    if (!vehicleRows || vehicleRows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ message: "Vehicle not found" });
    }

    const rate = Number(vehicleRows[0].rate_per_day);
    
    if (isNaN(rate) || rate <= 0) {
      await connection.rollback();
      return res.status(400).json({ message: "Invalid vehicle rate" });
    }

    // Calculate rental amount based on rent type
    let total_rental_amount = rate * days;
    let rate_multiplier = 1;

    if (rent_type_id) {
      const [rentTypeRows] = await pool.query(`SELECT name FROM rent_types WHERE id = ? AND status = 'active'`, [rent_type_id]);
      if (rentTypeRows && rentTypeRows.length > 0) {
        const typeName = rentTypeRows[0].name.toLowerCase();
        if (typeName.includes('weekly')) {
          rate_multiplier = 0.9;
          total_rental_amount = rate * days * 0.9;
        } else if (typeName.includes('monthly')) {
          rate_multiplier = 0.8;
          total_rental_amount = rate * days * 0.8;
        }
      }
    }

    const paid_now = Number(upfront_payment || 0);
    const advance_paid = Math.min(Number(advance_amount || 0), total_rental_amount);
    const deposit_collected = Number(security_deposit || 0);
    const rental_paid = advance_paid;

    if (paid_now !== (advance_paid + deposit_collected)) {
      await connection.rollback();
      return res.status(400).json({
        message: "Upfront payment must equal advance amount + security deposit",
        required: advance_paid + deposit_collected,
        received: paid_now
      });
    }

    let payment_status = "unpaid";
    if (rental_paid >= total_rental_amount) payment_status = "paid";
    else if (rental_paid > 0) payment_status = "partial";

    const booking_code = `BK-${Date.now()}`;

    // Insert booking within transaction
    const [result] = await connection.query(`
      INSERT INTO bookings
      (booking_code, customer_id, vehicle_id, rent_type_id, date_from, date_to,
       pickup_city, dropoff_city, rate_per_day, total_days, total_amount,
       advance_amount, paid_amount, security_deposit, status, payment_status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      booking_code, 
      customer_id, 
      vehicle_id, 
      rent_type_id || null,
      cleanDateFrom, 
      cleanDateTo, 
      pickup_city || null, 
      dropoff_city || null,
      rate, 
      days, 
      total_rental_amount, 
      advance_paid, 
      rental_paid,
      deposit_collected, 
      status, 
      payment_status
    ]);

    const bookingId = result.insertId;

    // Update customer balance within transaction
    await connection.query(
      `UPDATE customers SET balance = balance + ? - ? WHERE id = ?`,
      [total_rental_amount, rental_paid, customer_id]
    );

    // Insert payment records within transaction
    if (advance_paid > 0) {
      await connection.query(
        `INSERT INTO booking_payments (booking_id, payment_type, amount, payment_method, notes, created_at)
         VALUES (?, 'advance', ?, 'cash', 'Advance payment for rental', NOW())`,
        [bookingId, advance_paid]
      );
    }

    if (deposit_collected > 0) {
      await connection.query(
        `INSERT INTO booking_payments (booking_id, payment_type, amount, payment_method, notes, created_at)
         VALUES (?, 'security_deposit', ?, 'cash', 'Security deposit collected', NOW())`,
        [bookingId, deposit_collected]
      );
    }

    // Commit the transaction first
    await connection.commit();
    
    // Update vehicle status OUTSIDE the transaction to avoid lock conflicts
    // Use a separate connection for this operation
    try {
      await updateVehicleStatus(vehicle_id);
    } catch (statusError) {
      console.error('Error updating vehicle status (non-critical):', statusError);
      // Don't fail the booking creation if vehicle status update fails
    }

    res.status(201).json({
      success: true,
      message: "Booking created successfully",
      booking_code,
      booking_id: bookingId,
      status: status,
      total_rental_amount: total_rental_amount,
      security_deposit: deposit_collected,
      total_with_deposit: total_rental_amount + deposit_collected,
      advance_paid: advance_paid,
      deposit_collected: deposit_collected,
      remaining_rental: total_rental_amount - rental_paid,
      payment_status: payment_status,
      rent_type_id: rent_type_id || null,
      rate_multiplier: rate_multiplier,
      rate_per_day: rate,
      total_days: days
    });

  } catch (error) {
    // Rollback transaction on error
    try {
      await connection.rollback();
    } catch (rollbackError) {
      console.error('Error during rollback:', rollbackError);
    }
    
    console.error('Error in createBooking:', error);
    res.status(500).json({ 
      error: error.message,
      message: "Failed to create booking"
    });
  } finally {
    // Always release the connection back to the pool
    connection.release();
  }
};


// ====================== OPTIMIZED GET AVAILABLE VEHICLES ======================
export const getAvailableVehicles = async (req, res) => {
  try {
    const { date_from, date_to, vehicle_id } = req.query;

    let sql = `
      SELECT 
        v.*,
        JSON_ARRAYAGG(
          JSON_OBJECT(
            'url', vi.image_url,
            'public_id', vi.public_id
          )
        ) as images
      FROM vehicles v
      LEFT JOIN vehicle_images vi ON v.id = vi.vehicle_id
      WHERE v.status = 'available'
    `;

    const params = [];

    if (date_from && date_to) {
      sql += ` AND v.id NOT IN (
        SELECT vehicle_id FROM bookings 
        WHERE status NOT IN ('cancelled', 'completed')
        AND date_to >= ? AND date_from <= ?
      )`;
      params.push(date_from, date_to);
    }

    if (vehicle_id) {
      sql += ` AND v.id = ?`;
      params.push(vehicle_id);
    }

    sql += ` GROUP BY v.id ORDER BY v.car_make, v.car_model`;

    const [rows] = await pool.query(sql, params);
    
    // rows[0] might be undefined or not an array
    const vehiclesArray = rows[0] || [];
    
    // Ensure we have an array
    const formatted = Array.isArray(vehiclesArray) ? vehiclesArray.map((v) => ({
      ...v,
      images: v.images ? JSON.parse(v.images) : [],
      rate_per_day: parseFloat(v.rate_per_day)
    })) : [];

    res.json(formatted);
  } catch (error) {
    console.error('Error in getAvailableVehicles:', error);
    res.status(500).json({ error: error.message, data: [] });
  }
};


// ====================== GET ALL BOOKINGS ======================
export const getBookings = async (req, res) => {
  try {
    const { page = 1, limit = 10, search, status, payment_status } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const limitValue = parseInt(limit);

    let whereClause = "WHERE 1=1";
    const params = [];

    if (search) {
      whereClause += ` AND (b.booking_code LIKE ? OR c.customer_name LIKE ? OR v.registration_no LIKE ?)`;
      const searchPattern = `%${search}%`;
      params.push(searchPattern, searchPattern, searchPattern);
    }

    if (status) {
      whereClause += ` AND b.status = ?`;
      params.push(status);
    }

    if (payment_status) {
      whereClause += ` AND b.payment_status = ?`;
      params.push(payment_status);
    }

    const [countResult] = await pool.query(
      `SELECT COUNT(*) as total FROM bookings b ${whereClause}`,
      params
    );

    const total = countResult[0]?.total || 0;
    const totalPages = Math.ceil(total / limitValue);

    const [bookingsRows] = await pool.query(`
      SELECT 
        b.*,
        c.customer_name,
        c.phone_no,
        v.registration_no,
        v.car_make,
        v.car_model,
        rt.name as rent_type_name
      FROM bookings b
      INNER JOIN customers c ON b.customer_id = c.id
      INNER JOIN vehicles v ON b.vehicle_id = v.id
      LEFT JOIN rent_types rt ON b.rent_type_id = rt.id
      ${whereClause}
      ORDER BY b.created_at DESC
      LIMIT ? OFFSET ?
    `, [...params, limitValue, offset]);

    const bookingsArray = bookingsRows || [];

    res.json({
      success: true,
      data: bookingsArray,
      pagination: {
        currentPage: parseInt(page),
        limit: limitValue,
        total,
        totalPages,
        hasNext: parseInt(page) < totalPages,
        hasPrev: parseInt(page) > 1
      }
    });
  } catch (error) {
    console.error('Error in getBookings:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message,
      data: []
    });
  }
};
// ====================== UPDATE BOOKING ======================
export const updateBooking = (req, res) => {
  const { id } = req.params;

  const {
    date_from,
    date_to,
    pickup_city,
    dropoff_city,
    rent_type_id,
    advance_amount = 0,
    security_deposit = 0,
    status,
    payment_status,
  } = req.body;

  if (!date_from || !date_to) {
    return res.status(400).json({ message: "Dates required" });
  }

  // 🔍 get old booking
  pool.query(`SELECT * FROM bookings WHERE id=?`, [id], (err, rows) => {
    if (err) return res.status(500).json(err);
    if (!rows.length) {
      return res.status(404).json({ message: "Booking not found" });
    }

    const oldBooking = rows[0];

    if (oldBooking.status === "cancelled") {
      return res.status(400).json({
        message: "Cannot update cancelled booking",
      });
    }

    // Helper function to ensure date is YYYY-MM-DD without timezone conversion
    const formatToLocalDate = (dateValue) => {
      if (!dateValue) return null;

      // If it's already in YYYY-MM-DD format, return as is
      if (typeof dateValue === 'string' && dateValue.match(/^\d{4}-\d{2}-\d{2}$/)) {
        return dateValue;
      }

      // If it's a Date object or ISO string, convert to local date
      const date = new Date(dateValue);
      if (isNaN(date.getTime())) return null;

      // Use UTC methods to prevent timezone shift
      const year = date.getUTCFullYear();
      const month = String(date.getUTCMonth() + 1).padStart(2, '0');
      const day = String(date.getUTCDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };

    // Format dates - keep them as local dates without timezone conversion
    let cleanDateFrom = date_from;
    let cleanDateTo = date_to;

    // Remove any time component if present
    if (cleanDateFrom.includes('T')) cleanDateFrom = cleanDateFrom.split('T')[0];
    if (cleanDateTo.includes('T')) cleanDateTo = cleanDateTo.split('T')[0];

    // Get old dates in consistent format
    const oldDateFrom = formatToLocalDate(oldBooking.date_from);
    const oldDateTo = formatToLocalDate(oldBooking.date_to);

    if (!cleanDateFrom || !cleanDateTo) {
      return res.status(400).json({ message: "Invalid date format" });
    }

    const start = new Date(cleanDateFrom);
    const end = new Date(cleanDateTo);

    if (end < start) {
      return res.status(400).json({ message: "Invalid date range" });
    }

    // Calculate days (difference in days + 1)
    const diffTime = Math.abs(end - start);
    const days = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;

    const vehicleSql = `
      SELECT v.rate_per_day, b.vehicle_id
      FROM bookings b
      JOIN vehicles v ON b.vehicle_id = v.id
      WHERE b.id = ?
    `;

    pool.query(vehicleSql, [id], (err, vehicle) => {
      if (err) return res.status(500).json(err);

      const rate = Number(vehicle[0].rate_per_day);
      const vehicle_id = vehicle[0].vehicle_id;

      // Function to calculate rate multiplier based on rent type
      const getRateMultiplier = (rentTypeId, callback) => {
        if (!rentTypeId || rentTypeId === oldBooking.rent_type_id) {
          // If rent type hasn't changed, use the same multiplier logic as before
          let multiplier = 1;
          if (oldBooking.rent_type_id) {
            pool.query(`SELECT name FROM rent_types WHERE id = ?`, [oldBooking.rent_type_id], (err, rentType) => {
              if (!err && rentType && rentType.length > 0) {
                const typeName = rentType[0].name.toLowerCase();
                if (typeName.includes('weekly')) multiplier = 0.9;
                else if (typeName.includes('monthly')) multiplier = 0.8;
              }
              callback(multiplier);
            });
          } else {
            callback(1);
          }
        } else {
          // Fetch new rent type multiplier
          pool.query(`SELECT name FROM rent_types WHERE id = ? AND status = 'active'`, [rentTypeId], (err, rentType) => {
            let multiplier = 1;
            if (!err && rentType && rentType.length > 0) {
              const typeName = rentType[0].name.toLowerCase();
              if (typeName.includes('weekly')) multiplier = 0.9;
              else if (typeName.includes('monthly')) multiplier = 0.8;
            }
            callback(multiplier);
          });
        }
      };

      getRateMultiplier(rent_type_id, (multiplier) => {
        const new_total = rate * days * multiplier;
        const old_total = Number(oldBooking.total_amount);
        const diff = new_total - old_total;

        const performUpdate = () => {
          const updateSql = `
            UPDATE bookings
            SET 
              date_from=?,
              date_to=?,
              pickup_city=?,
              dropoff_city=?,
              rent_type_id=?,
              total_days=?,
              total_amount=?,
              advance_amount=?,
              security_deposit=?,
              status=?,
              payment_status=?,
              updated_at = NOW()
            WHERE id=?
          `;

          const finalStatus = status || oldBooking.status;
          const finalPaymentStatus = payment_status || oldBooking.payment_status;

          pool.query(
            updateSql,
            [
              cleanDateFrom,
              cleanDateTo,
              pickup_city,
              dropoff_city,
              rent_type_id || null,
              days,
              new_total,
              advance_amount,
              security_deposit,
              finalStatus,
              finalPaymentStatus,
              id,
            ],
            (err2) => {
              if (err2) {
                console.error('Update error:', err2);
                return res.status(500).json({ message: "Database update failed", error: err2 });
              }

              if (diff !== 0) {
                pool.query(
                  `UPDATE customers SET balance = balance + ? WHERE id=?`,
                  [diff, oldBooking.customer_id],
                  (err3) => {
                    if (err3) console.error('Balance update error:', err3);
                  }
                );
              }

              // Return the dates in local format
              res.json({
                message: "Booking updated successfully",
                old_total,
                new_total,
                difference: diff,
                status: finalStatus,
                payment_status: finalPaymentStatus,
                total_days: days,
                date_from: cleanDateFrom,
                date_to: cleanDateTo,
                rent_type_id: rent_type_id || null,
                rate_multiplier: multiplier
              });
            }
          );
        };

        // Check availability ONLY if dates changed
        const datesChanged = cleanDateFrom !== oldDateFrom || cleanDateTo !== oldDateTo;

        if (datesChanged) {
          const checkSql = `
            SELECT id FROM bookings 
            WHERE vehicle_id = ?
            AND id != ?
            AND status IN ('confirmed', 'ongoing')
            AND NOT (date_to < ? OR date_from > ?)
          `;

          pool.query(
            checkSql,
            [vehicle_id, id, cleanDateFrom, cleanDateTo],
            (err, existing) => {
              if (err) {
                console.error('Availability check error:', err);
                return res.status(500).json({ message: "Error checking availability" });
              }

              if (existing && existing.length > 0) {
                return res.status(400).json({
                  message: "Vehicle not available for selected dates",
                });
              }
              performUpdate();
            }
          );
        } else {
          performUpdate();
        }
      });
    });
  });
};


// ====================== UPDATE STATUS ======================
export const updateBookingStatus = async (req, res) => {
  let connection;
  
  try {
    const { id } = req.params;
    const { status } = req.body;

    const allowed = ["pending", "confirmed", "ongoing", "completed", "cancelled"];

    if (!allowed.includes(status)) {
      return res.status(400).json({ 
        success: false,
        message: "Invalid status",
        allowed_statuses: allowed 
      });
    }

    connection = await pool.getConnection();
    await connection.beginTransaction();

    // Get booking details
    const [bookingRows] = await connection.query(
      `SELECT 
        b.id, 
        b.vehicle_id, 
        b.customer_id,
        b.status as current_status,
        b.payment_status,
        b.total_amount,
        b.total_paid
      FROM bookings b
      WHERE b.id = ?`,
      [id]
    );

    if (!bookingRows || bookingRows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ 
        success: false,
        message: "Booking not found" 
      });
    }

    const booking = bookingRows[0];
    const currentStatus = booking.current_status;

    // If status is already the same, return success without updating
    if (currentStatus === status) {
      await connection.commit();
      return res.json({
        success: true,
        message: `Booking is already ${status}`,
        data: {
          booking_id: parseInt(id),
          status: status,
          previous_status: currentStatus,
          payment_status: booking.payment_status
        }
      });
    }

    // Validate status transition
    const validTransitions = {
      'pending': ['confirmed', 'cancelled'],
      'confirmed': ['ongoing', 'cancelled'],
      'ongoing': ['completed', 'cancelled'],
      'completed': [],
      'cancelled': []
    };

    if (validTransitions[currentStatus] && !validTransitions[currentStatus].includes(status)) {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        message: `Cannot change status from ${currentStatus} to ${status}`,
        allowed_transitions: validTransitions[currentStatus]
      });
    }

    // Update booking status
    const [result] = await connection.query(
      `UPDATE bookings 
       SET status = ?, 
           updated_at = NOW() 
       WHERE id = ? AND status != ?`,
      [status, id, status]
    );

    if (result.affectedRows === 0) {
      await connection.rollback();
      return res.status(404).json({ 
        success: false,
        message: "Booking not found or status unchanged" 
      });
    }

    await connection.commit();

    res.json({
      success: true,
      message: `Booking status changed from ${currentStatus} to ${status} successfully`,
      data: {
        booking_id: parseInt(id),
        status: status,
        previous_status: currentStatus,
        payment_status: booking.payment_status
      }
    });

  } catch (error) {
    if (connection) {
      await connection.rollback();
    }
    console.error('Error in updateBookingStatus:', error);
    res.status(500).json({ 
      success: false,
      message: "Failed to update booking status",
      error: error.message 
    });
  } finally {
    if (connection) {
      connection.release();
    }
  }
};


export const cancelBooking = async (req, res) => {
  try {
    const { id } = req.params;

    // Get booking details
    const [bookingRows] = await pool.query(
      `SELECT * FROM bookings WHERE id = ?`,
      [id]
    );

    if (!bookingRows || bookingRows.length === 0) {
      return res.status(404).json({ message: "Booking not found" });
    }

    const booking = bookingRows[0];

    // Check if already cancelled
    if (booking.status === "cancelled") {
      return res.status(400).json({ message: "Booking already cancelled" });
    }

    // Check if can be cancelled (only pending or confirmed can be cancelled)
    if (!['pending', 'confirmed'].includes(booking.status)) {
      return res.status(400).json({ 
        message: `Cannot cancel booking with status '${booking.status}'. Only pending or confirmed bookings can be cancelled.` 
      });
    }

    // Update status to cancelled
    const [result] = await pool.query(
      `UPDATE bookings SET status = 'cancelled', updated_at = NOW() WHERE id = ?`,
      [id]
    );

    // Reverse customer balance (add back the paid amount)
    const paid_amount = Number(booking.paid_amount || 0);
    if (paid_amount > 0) {
      await pool.query(
        `UPDATE customers SET balance = balance - ? WHERE id = ?`,
        [paid_amount, booking.customer_id]
      );
    }

    // Update vehicle status - check if vehicle becomes available
    let newVehicleStatus;
    try {
      newVehicleStatus = await updateVehicleStatus(booking.vehicle_id);
    } catch (vehicleError) {
      console.error('Error updating vehicle status:', vehicleError);
      newVehicleStatus = 'unknown';
    }

    res.json({
      success: true,
      message: "Booking cancelled successfully",
      booking_code: booking.booking_code,
      vehicle_status: newVehicleStatus,
      refund_amount: paid_amount
    });

  } catch (error) {
    console.error('Error in cancelBooking:', error);
    res.status(500).json({ 
      success: false,
      message: "Failed to cancel booking",
      error: error.message 
    });
  }
};

// backend/controllers/booking.controller.js

// ====================== GET BOOKING BY ID ======================
export const getBookingById = async (req, res) => {
  try {
    const { id } = req.params;

    // Get booking with customer and vehicle details
    const sql = `
      SELECT 
        b.*,
        c.customer_name,
        c.phone_no,
        c.cnic_no,
        c.address as customer_address,
        v.registration_no,
        v.car_make,
        v.car_model,
        rt.name as rent_type_name,
        rt.description as rent_type_description
      FROM bookings b
      INNER JOIN customers c ON b.customer_id = c.id
      INNER JOIN vehicles v ON b.vehicle_id = v.id
      LEFT JOIN rent_types rt ON b.rent_type_id = rt.id
      WHERE b.id = ?
    `;

    const [rows] = await pool.query(sql, [id]);

    if (!rows || rows.length === 0) {
      return res.status(404).json({ 
        success: false,
        message: "Booking not found" 
      });
    }

    const booking = rows[0];
    
    // Get total paid amount from booking_payments table
    const [paymentResult] = await pool.query(
      `SELECT COALESCE(SUM(amount), 0) as total_paid 
       FROM booking_payments 
       WHERE booking_id = ? AND payment_type IN ('advance', 'payment', 'security_deposit')`,
      [id]
    );
    
    const totalPaidFromPayments = parseFloat(paymentResult[0]?.total_paid || 0);
    
    // Also get advance amount from payments
    const [advanceResult] = await pool.query(
      `SELECT COALESCE(SUM(amount), 0) as advance_total 
       FROM booking_payments 
       WHERE booking_id = ? AND payment_type = 'advance'`,
      [id]
    );
    
    const advanceFromPayments = parseFloat(advanceResult[0]?.advance_total || 0);
    
    // Get security deposit from payments
    const [securityResult] = await pool.query(
      `SELECT COALESCE(SUM(amount), 0) as security_total 
       FROM booking_payments 
       WHERE booking_id = ? AND payment_type = 'security_deposit'`,
      [id]
    );
    
    const securityFromPayments = parseFloat(securityResult[0]?.security_total || 0);
    
    // Calculate remaining amount
    const totalAmount = Number(booking.total_amount) || 0;
    const remainingAmount = totalAmount - totalPaidFromPayments;
    
    // Format the booking object
    const formattedBooking = {
      id: booking.id,
      booking_code: booking.booking_code,
      customer_id: booking.customer_id,
      vehicle_id: booking.vehicle_id,
      rent_type_id: booking.rent_type_id,
      date_from: booking.date_from,
      date_to: booking.date_to,
      pickup_city: booking.pickup_city,
      dropoff_city: booking.dropoff_city,
      rate_per_day: Number(booking.rate_per_day) || 0,
      total_days: booking.total_days,
      total_amount: totalAmount,
      advance_amount: advanceFromPayments, // Use actual from payments
      paid_amount: totalPaidFromPayments, // Use actual from payments
      security_deposit: securityFromPayments, // Use actual from payments
      status: booking.status,
      payment_status: remainingAmount <= 0 ? 'paid' : (totalPaidFromPayments > 0 ? 'partial' : 'unpaid'),
      created_at: booking.created_at,
      updated_at: booking.updated_at,
      customer_name: booking.customer_name,
      phone_no: booking.phone_no,
      cnic_no: booking.cnic_no,
      customer_address: booking.customer_address,
      registration_no: booking.registration_no,
      car_make: booking.car_make,
      car_model: booking.car_model,
      rent_type_name: booking.rent_type_name,
      rent_type_description: booking.rent_type_description,
      remaining_amount: remainingAmount
    };

    res.json({
      success: true,
      data: formattedBooking
    });

  } catch (error) {
    console.error('Error in getBookingById:', error);
    res.status(500).json({ 
      success: false,
      message: "Failed to fetch booking details",
      error: error.message 
    });
  }
};



// Add this new function to get confirmed bookings
// ====================== GET CONFIRMED BOOKINGS (SIMPLIFIED) ======================
export const getConfirmedBookings = async (req, res) => {
  try {
    const { search } = req.query;

    let sql = `
      SELECT 
        b.id,
        b.booking_code,
        b.date_from,
        b.date_to,
        b.total_amount,
        b.advance_amount,
        b.paid_amount,
        b.security_deposit,
        b.status,
        b.payment_status,
        c.id as customer_id,
        c.customer_name,
        c.phone_no as customer_phone,
        v.id as vehicle_id,
        v.car_make,
        v.car_model,
        v.registration_no,
        v.rate_per_day,
        DATEDIFF(b.date_from, CURDATE()) as days_until_start
      FROM bookings b
      INNER JOIN customers c ON b.customer_id = c.id
      INNER JOIN vehicles v ON b.vehicle_id = v.id
      WHERE b.status = 'confirmed'
    `;

    const queryParams = [];

    // Add search filter if provided
    if (search) {
      sql += ` AND (b.booking_code LIKE ? OR c.customer_name LIKE ? OR v.registration_no LIKE ?)`;
      const searchPattern = `%${search}%`;
      queryParams.push(searchPattern, searchPattern, searchPattern);
    }

    sql += ` ORDER BY b.date_from ASC`;

    const [results] = await pool.query(sql, queryParams);

    // Format the results into a cleaner structure
    const formattedResults = results.map(booking => ({
      id: booking.id,
      booking_code: booking.booking_code,
      date_from: booking.date_from,
      date_to: booking.date_to,
      total_amount: Number(booking.total_amount) || 0,
      advance_amount: Number(booking.advance_amount) || 0,
      paid_amount: Number(booking.paid_amount) || 0,
      security_deposit: Number(booking.security_deposit) || 0,
      status: booking.status,
      payment_status: booking.payment_status,
      days_until_start: Number(booking.days_until_start) || 0,
      customer: {
        id: booking.customer_id,
        name: booking.customer_name,
        phone: booking.customer_phone
      },
      vehicle: {
        id: booking.vehicle_id,
        make: booking.car_make,
        model: booking.car_model,
        registration: booking.registration_no,
        rate_per_day: Number(booking.rate_per_day) || 0
      }
    }));

    res.json({
      success: true,
      data: formattedResults,
      count: formattedResults.length,
      summary: {
        total_confirmed: formattedResults.length,
        total_revenue: formattedResults.reduce((sum, b) => sum + b.total_amount, 0),
        total_advance_collected: formattedResults.reduce((sum, b) => sum + b.advance_amount, 0),
      }
    });

  } catch (error) {
    console.error('Error fetching confirmed bookings:', error);
    res.status(500).json({ 
      success: false,
      message: 'Database error', 
      error: error.message 
    });
  }
};


// ====================== DELETE BOOKING WITH FULL REVERSAL ======================
export const deleteBooking = async (req, res) => {
  const { id } = req.params;
  const connection = await pool.getConnection();

  try {
    // Start transaction
    await connection.beginTransaction();

    // First check if booking exists and get its details
    const [bookingRows] = await connection.query(`
      SELECT 
        b.*,
        v.id as vehicle_id,
        v.status as vehicle_status,
        c.id as customer_id,
        c.balance as customer_balance
      FROM bookings b
      INNER JOIN vehicles v ON b.vehicle_id = v.id
      INNER JOIN customers c ON b.customer_id = c.id
      WHERE b.id = ?
    `, [id]);

    if (!bookingRows || bookingRows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ error: "Booking not found" });
    }

    const booking = bookingRows[0];

    // Check if booking can be deleted based on status
    const allowedStatusesForDeletion = ['pending', 'cancelled'];
    const cannotDeleteStatuses = ['ongoing', 'completed'];

    if (cannotDeleteStatuses.includes(booking.status?.toLowerCase())) {
      await connection.rollback();
      return res.status(400).json({
        error: "Cannot delete booking",
        message: `Booking with status '${booking.status}' cannot be deleted. Only pending or cancelled bookings can be deleted.`,
        booking_code: booking.booking_code,
        current_status: booking.status,
        suggested_action: booking.status === 'ongoing' ? 'Complete handover first' : 'Archive instead'
      });
    }

    // Get all payments for this booking
    const [paymentRows] = await connection.query(`
      SELECT 
        id,
        payment_type,
        amount,
        payment_method,
        notes,
        created_at
      FROM booking_payments 
      WHERE booking_id = ?
      ORDER BY created_at ASC
    `, [id]);

    const hasPayments = paymentRows && paymentRows.length > 0;
    const totalPaid = paymentRows?.reduce((sum, p) => sum + parseFloat(p.amount), 0) || 0;

    // Get ledger entries
    const [ledgerRows] = await connection.query(`
      SELECT 
        id,
        entry_type,
        debit,
        credit,
        description
      FROM ledgers
      WHERE reference_table = 'bookings' AND reference_id = ?
    `, [id]);

    const hasLedgerEntries = ledgerRows && ledgerRows.length > 0;

    // 1. Reverse customer balance
    if (booking.total_amount > 0) {
      const balanceAdjustment = Number(booking.total_amount) - (Number(booking.paid_amount) || 0);
      await connection.query(
        `UPDATE customers SET balance = balance - ? WHERE id = ?`,
        [balanceAdjustment, booking.customer_id]
      );
    }

    // 2. Create reversal ledger entries for all existing ledgers
    if (hasLedgerEntries) {
      for (const ledger of ledgerRows) {
        await connection.query(`
          INSERT INTO ledgers
          (entry_type, reference_id, reference_table, customer_id, vehicle_id, debit, credit, description, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())
        `, [
          'deletion_reversal',
          booking.id,
          'bookings',
          booking.customer_id,
          booking.vehicle_id,
          Number(ledger.credit) || 0, // Reverse credit to debit
          Number(ledger.debit) || 0,   // Reverse debit to credit
          `DELETION: ${ledger.description} (Reversed)`
        ]);
      }

      // Delete original ledger entries
      await connection.query(
        "DELETE FROM ledgers WHERE reference_table = 'bookings' AND reference_id = ?",
        [id]
      );
    }

    // 3. Create reversal entries for payments and delete them
    if (hasPayments) {
      for (const payment of paymentRows) {
        // Add reversal payment record
        await connection.query(`
          INSERT INTO booking_payments
          (booking_id, payment_type, amount, payment_method, notes, created_at)
          VALUES (?, 'reversal', ?, ?, ?, NOW())
        `, [
          booking.id,
          Number(payment.amount),
          payment.payment_method || 'system',
          `Payment reversal for booking deletion - Original: ${payment.notes || payment.payment_type} (ID: ${payment.id})`
        ]);
      }

      // Delete original payments
      await connection.query(
        "DELETE FROM booking_payments WHERE booking_id = ?",
        [id]
      );
    }

    // 4. Update vehicle status back to available
    await connection.query(
      `UPDATE vehicles SET status = 'available' WHERE id = ?`,
      [booking.vehicle_id]
    );

    // 5. Delete the booking
    await connection.query("DELETE FROM bookings WHERE id = ?", [id]);

    // Commit transaction
    await connection.commit();

    res.json({
      success: true,
      message: hasPayments ? "Booking deleted successfully with all payments reversed" : "Booking deleted successfully",
      deleted_booking: {
        id: parseInt(id),
        booking_code: booking.booking_code,
        customer_id: booking.customer_id,
        vehicle_id: booking.vehicle_id,
        status: booking.status,
        original_total_amount: booking.total_amount,
        original_paid_amount: booking.paid_amount,
        had_payments: hasPayments,
        total_payments_reversed: totalPaid,
        had_ledger_entries: hasLedgerEntries
      }
    });

  } catch (error) {
    // Rollback transaction on error
    await connection.rollback();
    console.error('Error in deleteBooking:', error);
    res.status(500).json({
      success: false,
      error: "Failed to delete booking",
      message: error.message,
      reversal_status: "failed"
    });
  } finally {
    // Release connection back to pool
    connection.release();
  }
};