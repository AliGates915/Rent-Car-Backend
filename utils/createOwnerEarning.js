import { db } from "../config/db.js";

export const createOwnerEarningIfEligible = (bookingId) => {
  const sql = `
    SELECT 
      b.id,
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

  db.query(sql, [bookingId], (err, rows) => {
    if (err || !rows.length) return;

    const booking = rows[0];

    // ❌ condition fail
    if (booking.status !== "completed" || booking.payment_status !== "paid") {
      return;
    }

    if (!booking.owner_id) return;

    // ❌ prevent duplicate
    db.query(
      `SELECT id FROM owner_earnings WHERE booking_id=? LIMIT 1`,
      [bookingId],
      (err2, existing) => {
        if (err2 || existing.length > 0) return;

        const total = Number(booking.total_amount);
        const percentage = Number(booking.owner_percentage || 80);

        const owner_amount = (total * percentage) / 100;
        const company_amount = total - owner_amount;

        db.query(
          `INSERT INTO owner_earnings
          (owner_id, vehicle_id, booking_id, booking_code, total_days, booking_amount, owner_percentage, owner_amount, company_amount)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            booking.owner_id,
            booking.vehicle_id,
            booking.id,
            booking.booking_code,
            booking.total_days,
            total,
            percentage,
            owner_amount,
            company_amount
          ]
        );
      }
    );
  });
};

