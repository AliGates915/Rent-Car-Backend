import { db } from "../../config/db.js";
import { createOwnerEarningIfEligible } from "../../utils/createOwnerEarning.js";
import { addLedgerEntry } from "../../utils/ledger.js";
export const returnVehicle = (req, res) => {
  const { booking_id, extra_charges = 0, damage_charges = 0, notes } = req.body;

  // 1. booking get
  db.query(
    `SELECT * FROM bookings WHERE id = ?`,
    [booking_id],
    (err, result) => {
      if (err) return res.status(500).json(err);
      if (result.length === 0)
        return res.status(404).json({ message: "Booking not found" });

      const booking = result[0];

      // 2. total paid from payments table
      const paymentQuery = `
      SELECT 
        SUM(CASE WHEN payment_type IN ('advance','payment') THEN amount ELSE 0 END) as total_paid,
        SUM(CASE WHEN payment_type = 'security_deposit' THEN amount ELSE 0 END) as deposit
      FROM booking_payments
      WHERE booking_id = ?
    `;

      db.query(paymentQuery, [booking_id], (err2, payResult) => {
        if (err2) return res.status(500).json(err2);

        const total_paid = Number(payResult[0].total_paid || 0);
        const deposit = Number(payResult[0].deposit || 0);

        // 3. calculation
        const base_amount = Number(booking.total_amount);
        const final_amount =
          base_amount + Number(extra_charges) + Number(damage_charges);
        const balance_amount = final_amount - total_paid;

        // 4. insert return
        const insertReturn = `
        INSERT INTO vehicle_return
        (booking_id, vehicle_id, return_date, total_days, extra_charges, damage_charges, final_amount, paid_amount, balance_amount, notes)
        VALUES (?, ?, NOW(), ?, ?, ?, ?, ?, ?, ?)
      `;

        db.query(insertReturn, [
          booking.id,
          booking.vehicle_id,
          booking.total_days,
          extra_charges,
          damage_charges,
          final_amount,
          total_paid,
          balance_amount,
          notes,
        ]);

        // 5. add extra/damage as payment entries
        if (extra_charges > 0) {
          db.query(
            `INSERT INTO booking_payments (booking_id, payment_type, amount) VALUES (?, 'extra_charges', ?)`,
            [booking_id, extra_charges],
          );
        }

        if (damage_charges > 0) {
          db.query(
            `INSERT INTO booking_payments (booking_id, payment_type, amount) VALUES (?, 'extra_charges', ?)`,
            [booking_id, damage_charges],
          );
        }

        // 6. update booking & vehicle
        db.query(`UPDATE bookings SET status='completed' WHERE id=?`, [
          booking_id,
        ]);
        db.query(`UPDATE vehicles SET status='available' WHERE id=?`, [
          booking.vehicle_id,
        ]);

        // 🔥 CALL HERE
        createOwnerEarningIfEligible(booking_id);

        addLedgerEntry({
          entry_type: "return",
          reference_id: booking_id,
          reference_table: "vehicle_return",
          vehicle_id: booking.vehicle_id,
          description: "Vehicle returned",
        });

        res.json({
          message: "Return completed",
          final_amount,
          total_paid,
          balance_amount,
        });
      });
    },
  );
};
