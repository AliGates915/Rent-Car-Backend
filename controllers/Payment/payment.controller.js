import { db } from "../../config/db.js";
import { createOwnerEarningIfEligible } from "../../utils/createOwnerEarning.js";
import { addLedgerEntry } from "../../utils/ledger.js";
// 🔥 ADD PAYMENT
export const addPayment = (req, res) => {
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

  db.query(`SELECT * FROM bookings WHERE id = ?`, [booking_id], (err, rows) => {
    if (err) return res.status(500).json(err);
    if (rows.length === 0)
      return res.status(404).json({ message: "Booking not found" });

    const booking = rows[0];

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

    db.query(
      insertSql,
      [booking_id, payment_type, payAmount, payment_method, notes],
      (err2, result) => {
        if (err2) return res.status(500).json(err2);

        updateBookingPaymentSummary(booking_id, (err3) => {
          if (err3) return res.status(500).json(err3);

          db.query(
            `SELECT * FROM bookings WHERE id = ?`,
            [booking_id],
            (err4, updatedRows) => {
              if (err4) return res.status(500).json(err4);

              const updated = updatedRows[0];

              const remaining_after =
                Number(updated.total_amount) -
                (Number(updated.advance_amount) + Number(updated.paid_amount));

              // after insert payment
              db.query(
                `UPDATE customers 
   SET balance = balance - ? 
   WHERE id = ?`,
                [payAmount, booking.customer_id],
              );
            },
          );
          addLedgerEntry({
            entry_type: "payment",
            reference_id: result.insertId,
            reference_table: "booking_payments",
            customer_id: booking.customer_id,
            vehicle_id: booking.vehicle_id,
            debit: payAmount,
            description: "Booking payment",
          });

          res.status(201).json({
            message: "Payment added successfully",
            payment_id: result.insertId,
            remaining_after_payment: remaining_after,
            payment_status: updated.payment_status,
          });
        });
      },
    );
  });
};

// 🔥 UPDATE SUMMARY + PAYMENT STATUS
export const updateBookingPaymentSummary = (bookingId, callback) => {
  const sumSql = `
    SELECT
      COALESCE(SUM(CASE WHEN payment_type = 'advance' THEN amount ELSE 0 END), 0) AS advance_amount,
      COALESCE(SUM(CASE WHEN payment_type = 'payment' THEN amount ELSE 0 END), 0) AS paid_amount
    FROM booking_payments
    WHERE booking_id = ?
  `;

  db.query(sumSql, [bookingId], (err, rows) => {
    if (err) return callback(err);

    const advance = Number(rows[0].advance_amount || 0);
    const paid = Number(rows[0].paid_amount || 0);

    db.query(
      `SELECT total_amount, status FROM bookings WHERE id = ?`,
      [bookingId],
      (err2, bRows) => {
        if (err2) return callback(err2);

        const total = Number(bRows[0].total_amount || 0);
        const status = bRows[0].status;

        const remaining = total - (advance + paid);

        let payment_status = "unpaid";

        if (remaining === total) payment_status = "unpaid";
        else if (remaining > 0) payment_status = "partial";
        else if (remaining === 0) payment_status = "paid";

        db.query(
          `UPDATE bookings 
         SET advance_amount=?, paid_amount=?, payment_status=? 
         WHERE id=?`,
          [advance, paid, payment_status, bookingId],
          (err3) => {
            if (err3) return callback(err3);

            // 🔥 AUTO OWNER EARNING
            createOwnerEarningIfEligible(bookingId);

            callback(null);
          },
        );
      },
    );
  });
};

// 🔥 DELETE PAYMENT (admin use only)
export const deletePayment = (req, res) => {
  const { id } = req.params;

  db.query(`SELECT * FROM booking_payments WHERE id = ?`, [id], (err, rows) => {
    if (err) return res.status(500).json(err);
    if (!rows.length)
      return res.status(404).json({ message: "Payment not found" });

    const booking_id = rows[0].booking_id;

    db.query(`DELETE FROM booking_payments WHERE id = ?`, [id], (err2) => {
      if (err2) return res.status(500).json(err2);

      updateBookingPaymentSummary(booking_id, (err3) => {
        if (err3) return res.status(500).json(err3);

        res.json({ message: "Payment deleted successfully" });
      });
    });
  });
};

// 🔥 GET PAYMENTS
export const getPaymentsByBooking = (req, res) => {
  const { booking_id } = req.params;

  db.query(
    `SELECT * FROM booking_payments WHERE booking_id = ? ORDER BY id DESC`,
    [booking_id],
    (err, rows) => {
      if (err) return res.status(500).json(err);
      res.json(rows);
    },
  );
};
