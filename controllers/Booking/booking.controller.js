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

    const cleanDateFrom = date_from.split("T")[0];
    const cleanDateTo = date_to.split("T")[0];

    const start = new Date(cleanDateFrom);
    const end = new Date(cleanDateTo);

    if (end < start) {
      return res.status(400).json({ message: "Invalid date range" });
    }

    const days = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;

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

      // 🔥 availability check
      const checkSql = `
        SELECT id FROM bookings 
        WHERE vehicle_id = ?
        AND id != ?
        AND status IN ('confirmed','ongoing')
        AND NOT (date_to < ? OR date_from > ?)
      `;

      db.query(
        checkSql,
        [vehicle_id, id, date_from, date_to],
        (err, existing) => {
          if (err) return res.status(500).json(err);

          if (existing.length > 0) {
            return res.status(400).json({
              message: "Vehicle not available",
            });
          }

          const new_total = rate * days;
          const old_total = Number(oldBooking.total_amount);

          const diff = new_total - old_total; // 🔥 IMPORTANT

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
            updated_at = NOW()
          WHERE id=?
        `;

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
              id,
            ],
            (err2) => {
              if (err2) return res.status(500).json(err2);

              // 🔥 update customer balance ONLY DIFF
              db.query(
                `UPDATE customers SET balance = balance + ? WHERE id=?`,
                [diff, oldBooking.customer_id],
              );
              addLedgerEntry({
  entry_type: "booking",
  reference_id: id,  // Use the booking ID from params
  reference_table: "bookings",
  customer_id: oldBooking.customer_id,  // Use from oldBooking
  vehicle_id: vehicle_id,
  credit: diff > 0 ? diff : 0,  // Only add positive differences
  debit: diff < 0 ? Math.abs(diff) : 0,  // Handle reductions
  description: `Booking ${oldBooking.booking_code} updated - amount adjustment`,
});

              res.json({
                message: "Booking updated successfully",
                old_total,
                new_total,
                difference: diff,
              });
            },
          );
        },
      );
    });
  });
};

// ====================== GET ALL BOOKINGS ======================
export const getBookings = (req, res) => {
  const sql = `
    SELECT 
      b.*,
      v.registration_no,
      v.car_make,
      v.car_model,
      c.customer_name as customer_name,
      c.phone_no as customer_phone,
      GROUP_CONCAT(
        CONCAT(
          '{"url":"', vi.image_url, '","public_id":"', vi.public_id, '"}'
        )
      ) as images
    FROM bookings b
    JOIN vehicles v ON b.vehicle_id = v.id
    JOIN customers c ON b.customer_id = c.id
    LEFT JOIN vehicle_images vi ON v.id = vi.vehicle_id
    GROUP BY b.id
    ORDER BY b.id DESC
  `;

  db.query(sql, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    
    const formatted = rows.map((b) => ({
      ...b,
      images: b.images ? JSON.parse(`[${b.images}]`) : [],
      // Format dates for frontend
      date_from: b.date_from,
      date_to: b.date_to,
      // Ensure numeric values
      total_amount: parseFloat(b.total_amount),
      advance_amount: parseFloat(b.advance_amount),
      paid_amount: parseFloat(b.paid_amount),
      security_deposit: parseFloat(b.security_deposit),
      rate_per_day: parseFloat(b.rate_per_day)
    }));

    res.json(formatted);
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