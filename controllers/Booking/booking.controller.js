import { db } from "../../config/db.js";
import { addLedgerEntry } from "../../utils/ledger.js";

// ====================== CREATE BOOKING ======================
export const createBooking = (req, res) => {
  const {
    customer_id,
    vehicle_id,
    date_from,
    date_to,
    pickup_city,
    dropoff_city,
    advance_amount = 0,
    security_deposit = 0,
    upfront_payment = 0,
  } = req.body;

  if (!customer_id || !vehicle_id || !date_from || !date_to) {
    return res.status(400).json({ message: "Missing required fields" });
  }

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
      const total_amount = rate * days;

      const paid_now = Number(upfront_payment || 0);

      if (paid_now > total_amount) {
        return res.status(400).json({
          message: "Upfront payment cannot exceed total amount",
        });
      }

      let payment_status = "unpaid";
      if (paid_now === total_amount) payment_status = "paid";
      else if (paid_now > 0) payment_status = "partial";

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
          total_amount,
          advance_amount,
          paid_now,
          security_deposit,
          payment_status,
        ],
        (err, result) => {
          if (err) return res.status(500).json(err);

          // 🔥 update customer balance (NET)
          db.query(
            `UPDATE customers 
             SET balance = balance + ? - ? 
             WHERE id = ?`,
            [total_amount, paid_now, customer_id],
          );

          // 🔥 insert payment if upfront
          if (paid_now > 0) {
            db.query(
              `INSERT INTO booking_payments 
               (booking_id, payment_type, amount, payment_method, notes)
               VALUES (?, 'payment', ?, 'cash', 'Upfront payment')`,
              [result.insertId, paid_now],
            );
          }

          addLedgerEntry({
            entry_type: "booking",
            reference_id: result.insertId,
            reference_table: "bookings",
            customer_id,
            vehicle_id,
            credit: total_amount,
            description: `Booking ${booking_code}`,
          });

          res.json({
            message: "Booking created successfully",
            booking_code,
            total_amount,
            paid_now,
            remaining: total_amount - paid_now,
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
                reference_id: result.insertId,
                reference_table: "bookings",
                customer_id,
                vehicle_id,
                credit: total_amount,
                description: `Booking ${booking_code}`,
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
      GROUP_CONCAT(
        CONCAT(
          '{"url":"', vi.image_url, '","public_id":"', vi.public_id, '"}'
        )
      ) as images
    FROM bookings b
    JOIN vehicles v ON b.vehicle_id = v.id
    LEFT JOIN vehicle_images vi ON v.id = vi.vehicle_id
    GROUP BY b.id
    ORDER BY b.id DESC
  `;

  db.query(sql, (err, rows) => {
    if (err) return res.status(500).json(err);

    const formatted = rows.map((b) => ({
      ...b,
      images: b.images ? JSON.parse(`[${b.images}]`) : [],
    }));

    res.json(formatted);
  });
};

// ====================== GET BOOKING BY ID ======================
export const getBookingById = (req, res) => {
  const { id } = req.params;

  const sql = `
    SELECT b.*, v.registration_no, v.car_make
    FROM bookings b
    JOIN vehicles v ON b.vehicle_id = v.id
    WHERE b.id=?
  `;

  db.query(sql, [id], (err, rows) => {
    if (err) return res.status(500).json(err);

    if (rows.length === 0) {
      return res.status(404).json({ message: "Booking not found" });
    }

    res.json(rows[0]);
  });
};

// ====================== CANCEL BOOKING ======================
export const cancelBooking = (req, res) => {
  const { id } = req.params;

  const sql = `UPDATE bookings SET status='cancelled' WHERE id=?`;

  db.query(sql, [id], (err) => {
    if (err) return res.status(500).json(err);

    res.json({ message: "Booking cancelled" });
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

  db.query(sql, [status, id], (err) => {
    if (err) return res.status(500).json(err);

    res.json({ message: "Status updated" });
  });
};

// ====================== AVAILABLE VEHICLES ======================
export const getAvailableVehicles = (req, res) => {
  const { date_from, date_to } = req.query;

  if (!date_from || !date_to) {
    return res.status(400).json({ message: "Dates required" });
  }

  const sql = `
    SELECT 
      v.*,
      GROUP_CONCAT(
        CONCAT(
          '{"url":"', vi.image_url, '","public_id":"', vi.public_id, '"}'
        )
      ) as images
    FROM vehicles v
    LEFT JOIN vehicle_images vi ON v.id = vi.vehicle_id
    WHERE v.id NOT IN (
      SELECT vehicle_id FROM bookings
      WHERE status IN ('confirmed','ongoing')
      AND NOT (date_to < ? OR date_from > ?)
    )
    GROUP BY v.id
  `;

  db.query(sql, [date_from, date_to], (err, rows) => {
    if (err) return res.status(500).json(err);

    const formatted = rows.map((v) => ({
      ...v,
      images: v.images ? JSON.parse(`[${v.images}]`) : [],
    }));

    res.json(formatted);
  });
};
