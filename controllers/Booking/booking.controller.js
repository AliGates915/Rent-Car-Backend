import { db } from "../../config/db.js";
import { addLedgerEntry } from "../../utils/ledger.js";

// ====================== CREATE BOOKING ======================
// ====================== CREATE BOOKING ======================
export const createBooking = (req, res) => {
  const {
    customer_id,
    vehicle_id,
    date_from,
    date_to,
    pickup_city,
    dropoff_city,
    advance_amount = 0,  // This is payment toward rental
    security_deposit = 0, // This is separate deposit (refundable)
    upfront_payment = 0,  // Total paid now (advance + security deposit)
  } = req.body;

  if (!customer_id || !vehicle_id || !date_from || !date_to) {
    return res.status(400).json({ message: "Missing required fields" });
  }

  // Check vehicle availability
  const checkSql = `
    SELECT id FROM bookings 
    WHERE vehicle_id = ?
    AND status IN ('confirmed','ongoing')
    AND NOT (date_to <= ? OR date_from >= ?)
  `;

  db.query(checkSql, [vehicle_id, date_from, date_to], (err, existing) => {
    if (err) return res.status(500).json(err);

    if (existing.length > 0) {
      return res.status(400).json({ message: "Vehicle not available" });
    }

    const cleanDateFrom = date_from.split("T")[0];
    const cleanDateTo = date_to.split("T")[0];

    const start = new Date(cleanDateFrom);
    const end = new Date(cleanDateTo);

    if (end < start) {
      return res.status(400).json({ message: "Invalid date range" });
    }

    const days = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;

    const vehicleSql = `SELECT rate_per_day FROM vehicles WHERE id=?`;

    db.query(vehicleSql, [vehicle_id], (err, vehicle) => {
      if (err) return res.status(500).json(err);
      if (!vehicle.length) {
        return res.status(404).json({ message: "Vehicle not found" });
      }

      const rate = Number(vehicle[0].rate_per_day);
      const total_rental_amount = rate * days;
      
      // Total to be paid (rental + deposit)
      const total_amount = total_rental_amount + Number(security_deposit);
      
      // Amount paid now (advance toward rental + security deposit)
      const paid_now = Number(upfront_payment || 0);
      
      // Advance paid toward rental only
      const advance_paid = Math.min(Number(advance_amount || 0), total_rental_amount);
      
      // Security deposit collected
      const deposit_collected = Number(security_deposit || 0);
      
      // Total paid toward rental (not including deposit)
      const rental_paid = advance_paid;

      if (paid_now !== (advance_paid + deposit_collected)) {
        return res.status(400).json({
          message: "Upfront payment must equal advance amount + security deposit",
        });
      }

      // Calculate payment status for rental only
      let payment_status = "unpaid";
      if (rental_paid === total_rental_amount) payment_status = "paid";
      else if (rental_paid > 0) payment_status = "partial";

      const booking_code = `BK-${Date.now()}`;

      const insertSql = `
        INSERT INTO bookings
        (booking_code, customer_id, vehicle_id, date_from, date_to,
         pickup_city, dropoff_city, rate_per_day, total_days, total_amount,
         advance_amount, paid_amount, security_deposit, status, payment_status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'confirmed', ?)
      `;

      db.query(
        insertSql,
        [
          booking_code,
          customer_id,
          vehicle_id,
          cleanDateFrom,
          cleanDateTo,
          pickup_city,
          dropoff_city,
          rate,
          days,
          total_amount,  // rental + deposit
          advance_paid,  // advance toward rental
          rental_paid,   // total paid toward rental
          deposit_collected, // security deposit
          payment_status,
        ],
        (err, result) => {
          if (err) return res.status(500).json(err);

          // Update customer balance (only rental amount, deposit is separate)
          db.query(
            `UPDATE customers 
             SET balance = balance + ? - ? 
             WHERE id = ?`,
            [total_rental_amount, rental_paid, customer_id],
          );

          // Insert payment record for advance
          if (advance_paid > 0) {
            db.query(
              `INSERT INTO booking_payments 
               (booking_id, payment_type, amount, payment_method, notes)
               VALUES (?, 'advance', ?, 'cash', 'Advance payment for rental')`,
              [result.insertId, advance_paid],
            );
          }
          
          // Insert payment record for security deposit
          if (deposit_collected > 0) {
            db.query(
              `INSERT INTO booking_payments 
               (booking_id, payment_type, amount, payment_method, notes)
               VALUES (?, 'security_deposit', ?, 'cash', 'Security deposit collected')`,
              [result.insertId, deposit_collected],
            );
          }

          addLedgerEntry({
            entry_type: "booking",
            reference_id: result.insertId,
            reference_table: "bookings",
            customer_id,
            vehicle_id,
            credit: total_rental_amount,
            description: `Booking ${booking_code} - Rental amount`,
          });

          res.json({
            message: "Booking created successfully",
            booking_code,
            total_rental_amount,
            total_with_deposit: total_amount,
            advance_paid: advance_paid,
            deposit_collected: deposit_collected,
            remaining_rental: total_rental_amount - rental_paid,
            payment_status,
          });
        },
      );
    });
  });
};



// ====================== UPDATE BOOKING ======================
export const updateBooking = (req, res) => {
  const { id } = req.params;

  const {
    date_from,
    date_to,
    pickup_city,
    dropoff_city,
    advance_amount = 0,
    security_deposit = 0,
    status,
    payment_status,
  } = req.body;

  if (!date_from || !date_to) {
    return res.status(400).json({ message: "Dates required" });
  }

  // 🔍 get old booking
  db.query(`SELECT * FROM bookings WHERE id=?`, [id], (err, rows) => {
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

    db.query(vehicleSql, [id], (err, vehicle) => {
      if (err) return res.status(500).json(err);

      const rate = Number(vehicle[0].rate_per_day);
      const vehicle_id = vehicle[0].vehicle_id;

      const performUpdate = () => {
        const new_total = rate * days;
        const old_total = Number(oldBooking.total_amount);
        const diff = new_total - old_total;

        const updateSql = `
          UPDATE bookings
          SET 
            date_from=?,
            date_to=?,
            pickup_city=?,
            dropoff_city=?,
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

        db.query(
          updateSql,
          [
            cleanDateFrom,
            cleanDateTo,
            pickup_city,
            dropoff_city,
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
              db.query(
                `UPDATE customers SET balance = balance + ? WHERE id=?`,
                [diff, oldBooking.customer_id],
                (err3) => {
                  if (err3) console.error('Balance update error:', err3);
                }
              );
              
              if (typeof addLedgerEntry === 'function') {
                addLedgerEntry({
                  entry_type: "booking",
                  reference_id: id,
                  reference_table: "bookings",
                  customer_id: oldBooking.customer_id,
                  vehicle_id: vehicle_id,
                  credit: diff > 0 ? diff : 0,
                  debit: diff < 0 ? Math.abs(diff) : 0,
                  description: `Booking ${oldBooking.booking_code} updated - amount adjustment`,
                });
              }
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
              date_to: cleanDateTo
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

        db.query(
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
};



// Add this new function to get confirmed bookings
export const getConfirmedBookings = (req, res) => {
  const { search } = req.query;
  
  let sql = `
    SELECT 
      b.id,
      b.booking_code,
      b.date_from,
      b.date_to,
      b.total_amount,
      b.advance_amount,
      b.status,
      c.id as customer_id,
      c.customer_name,
      v.id as vehicle_id,
      v.car_make,
      v.car_model,
      v.registration_no,
      v.rate_per_day
    FROM bookings b
    JOIN customers c ON b.customer_id = c.id
    JOIN vehicles v ON b.vehicle_id = v.id
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
  
  db.query(sql, queryParams, (err, results) => {
    if (err) {
      console.error('Error fetching confirmed bookings:', err);
      return res.status(500).json({ message: 'Database error', error: err });
    }
    
    res.json(results);
  });
};

// Update the existing getBookings function to handle status filter
export const getBookings = (req, res) => {
  const { page = 1, limit = 10, search, status } = req.query;
  const offset = (page - 1) * limit;
  
  let sql = `
    SELECT 
      b.*,
      c.customer_name,
      v.id as vehicle_id,
      v.car_make,
      v.car_model,
      v.registration_no,
      v.rate_per_day
    FROM bookings b
    JOIN customers c ON b.customer_id = c.id
    JOIN vehicles v ON b.vehicle_id = v.id
    WHERE 1=1
  `;
  
  const queryParams = [];
  
  // Add status filter if provided
  if (status) {
    sql += ` AND b.status = ?`;
    queryParams.push(status);
  }
  
  // Add search filter if provided
  if (search) {
    sql += ` AND (b.booking_code LIKE ? OR c.customer_name LIKE ? OR v.registration_no LIKE ?)`;
    const searchPattern = `%${search}%`;
    queryParams.push(searchPattern, searchPattern, searchPattern);
  }
  
  sql += ` ORDER BY b.created_at DESC LIMIT ? OFFSET ?`;
  queryParams.push(parseInt(limit), offset);
  
  db.query(sql, queryParams, (err, results) => {
    if (err) {
      console.error('Error fetching bookings:', err);
      return res.status(500).json({ message: 'Database error', error: err });
    }
    
    // Get total count for pagination
    let countSql = `SELECT COUNT(*) as total FROM bookings b WHERE 1=1`;
    const countParams = [];
    
    if (status) {
      countSql += ` AND status = ?`;
      countParams.push(status);
    }
    
    if (search) {
      countSql += ` AND (booking_code LIKE ?)`;
      countParams.push(`%${search}%`);
    }
    
    db.query(countSql, countParams, (err, countResult) => {
      if (err) {
        console.error('Error counting bookings:', err);
        return res.status(500).json({ message: 'Database error', error: err });
      }
      
      res.json({
        data: results,
        total: countResult[0].total,
        page: parseInt(page),
        limit: parseInt(limit)
      });
    });
  });
};

// ====================== GET BOOKING BY ID WITH PAYMENTS ======================
export const getBookingById = (req, res) => {
  const { id } = req.params;

  const bookingSql = `
    SELECT 
      b.*, 
      v.registration_no, 
      v.car_make,
      v.car_model,
      v.rate_per_day,
      v.car_type,
      v.transmission_type,
      v.fuel_type,
      v.seating_capacity,
      c.customer_name,
      c.phone_no as customer_phone
    FROM bookings b
    JOIN vehicles v ON b.vehicle_id = v.id
    JOIN customers c ON b.customer_id = c.id
    WHERE b.id = ?
  `;

  db.query(bookingSql, [id], (err, rows) => {
    if (err) {
      console.error('Get booking by ID error:', err);
      return res.status(500).json({ error: err.message });
    }

    if (rows.length === 0) {
      return res.status(404).json({ message: "Booking not found" });
    }

    // Get payments for this booking
    const paymentsSql = `
      SELECT 
        id,
        payment_type,
        amount,
        payment_method,
        notes,
        created_at
      FROM booking_payments
      WHERE booking_id = ?
      ORDER BY created_at DESC
    `;

    db.query(paymentsSql, [id], (err, payments) => {
      if (err) {
        console.error('Get payments error:', err);
        // Still return booking even if payments fail
        payments = [];
      }

      // Calculate total paid
      const total_paid = (payments || [])
        .filter(p => p.payment_type === 'payment' || p.payment_type === 'advance')
        .reduce((sum, p) => sum + parseFloat(p.amount || 0), 0);

      const booking = {
        ...rows[0],
        total_amount: parseFloat(rows[0].total_amount || 0),
        advance_amount: parseFloat(rows[0].advance_amount || 0),
        paid_amount: parseFloat(rows[0].paid_amount || 0),
        security_deposit: parseFloat(rows[0].security_deposit || 0),
        rate_per_day: parseFloat(rows[0].rate_per_day || 0),
        total_paid: total_paid,
        remaining_balance: parseFloat(rows[0].total_amount || 0) - total_paid,
        payments: payments || []
      };

      res.json(booking);
    });
  });
};
// ====================== UPDATE STATUS ======================
export const updateBookingStatus = (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  const allowed = ["pending", "confirmed", "ongoing", "completed", "cancelled"];

  if (!allowed.includes(status)) {
    return res.status(400).json({ message: "Invalid status" });
  }

  const sql = `UPDATE bookings SET status=? WHERE id=?`;

  db.query(sql, [status, id], (err, result) => {
    if (err) return res.status(500).json(err);
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Booking not found" });
    }

    res.json({ 
      message: `Booking ${status} successfully`,
      status: status 
    });
  });
};

// ====================== CANCEL BOOKING ======================
export const cancelBooking = (req, res) => {
  const { id } = req.params;

  // First get the booking details to reverse any payments
  const getBookingSql = `SELECT * FROM bookings WHERE id=?`;
  
  db.query(getBookingSql, [id], (err, booking) => {
    if (err) return res.status(500).json(err);
    if (!booking.length) {
      return res.status(404).json({ message: "Booking not found" });
    }

    const oldBooking = booking[0];
    
    // Check if already cancelled
    if (oldBooking.status === "cancelled") {
      return res.status(400).json({ message: "Booking already cancelled" });
    }

    // Update status to cancelled
    const updateSql = `UPDATE bookings SET status='cancelled' WHERE id=?`;
    
    db.query(updateSql, [id], (err, result) => {
      if (err) return res.status(500).json(err);

      // Reverse customer balance (only rental amount, not deposit)
      const total_rental_amount = oldBooking.total_amount - (oldBooking.security_deposit || 0);
      const paid_amount = oldBooking.paid_amount || 0;
      
      if (paid_amount > 0) {
        db.query(
          `UPDATE customers SET balance = balance - ? WHERE id=?`,
          [paid_amount, oldBooking.customer_id]
        );
      }

      // Add ledger entry for cancellation
      addLedgerEntry({
        entry_type: "cancellation",
        reference_id: id,
        reference_table: "bookings",
        customer_id: oldBooking.customer_id,
        vehicle_id: oldBooking.vehicle_id,
        debit: paid_amount,
        description: `Booking ${oldBooking.booking_code} cancelled - payment reversed`,
      });

      res.json({ 
        message: "Booking cancelled successfully",
        booking_code: oldBooking.booking_code
      });
    });
  });
};

// ====================== AVAILABLE VEHICLES ======================
export const getAvailableVehicles = (req, res) => {
  const { date_from, date_to, vehicle_id } = req.query;
  
  let sql = `
    SELECT 
      v.*,
      GROUP_CONCAT(
        CONCAT(
          '{"url":"', vi.image_url, '","public_id":"', vi.public_id, '"}'
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
      AND (
        (date_from <= ? AND date_to >= ?) OR
        (date_from BETWEEN ? AND ?) OR
        (date_to BETWEEN ? AND ?)
      )
    )`;
    params.push(date_to, date_from, date_from, date_to, date_from, date_to);
  }
  
  if (vehicle_id) {
    sql += ` AND v.id = ?`;
    params.push(vehicle_id);
  }
  
  sql += ` GROUP BY v.id ORDER BY v.car_make, v.car_model`;
  
  db.query(sql, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    
    const formatted = rows.map((v) => ({
      ...v,
      images: v.images ? JSON.parse(`[${v.images}]`) : [],
      rate_per_day: parseFloat(v.rate_per_day)
    }));
    
    res.json(formatted);
  });
};