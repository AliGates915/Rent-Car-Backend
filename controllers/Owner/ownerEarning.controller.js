import { db } from "../../config/db.js";
import { addLedgerEntry } from "../../utils/ledger.js";

// ✅ create owner earning when booking is completed + paid
export const createOwnerEarningFromBooking = (req, res) => {
  const { booking_id } = req.body;

  if (!booking_id) {
    return res.status(400).json({ message: "booking_id is required" });
  }

  const sql = `
    SELECT 
      b.id AS booking_id,
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

  db.query(sql, [booking_id], (err, rows) => {
    if (err) return res.status(500).json(err);
    if (!rows.length) {
      return res.status(404).json({ message: "Booking not found" });
    }

    const booking = rows[0];

    if (!booking.owner_id) {
      return res.status(400).json({ message: "This vehicle has no owner assigned" });
    }

    if (booking.status !== "completed") {
      return res.status(400).json({ message: "Booking is not completed yet" });
    }

    if (booking.payment_status !== "paid") {
      return res.status(400).json({ message: "Booking is not fully paid yet" });
    }

    // prevent duplicate earning
    db.query(
      `SELECT id FROM owner_earnings WHERE booking_id = ? LIMIT 1`,
      [booking_id],
      (err2, existing) => {
        if (err2) return res.status(500).json(err2);

        if (existing.length > 0) {
          return res.status(400).json({ message: "Owner earning already created for this booking" });
        }

        const bookingAmount = Number(booking.total_amount || 0);
        const ownerPercentage = Number(booking.owner_percentage || 80);
        const ownerAmount = (bookingAmount * ownerPercentage) / 100;
        const companyAmount = bookingAmount - ownerAmount;

        const insertSql = `
          INSERT INTO owner_earnings
          (
            owner_id,
            vehicle_id,
            booking_id,
            booking_code,
            total_days,
            booking_amount,
            owner_percentage,
            owner_amount,
            company_amount,
            status
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'unpaid')
        `;

        db.query(
          insertSql,
          [
            booking.owner_id,
            booking.vehicle_id,
            booking.booking_id,
            booking.booking_code,
            booking.total_days,
            bookingAmount,
            ownerPercentage,
            ownerAmount,
            companyAmount
          ],
          (err3, result) => {
            if (err3) return res.status(500).json(err3);

            addLedgerEntry({
  entry_type: "owner",
  reference_id: result.insertId,
  reference_table: "owner_earnings",
  owner_id: booking.owner_id,
  credit: owner_amount,
  description: "Owner earning"
});

            res.status(201).json({
              message: "Owner earning created successfully",
              id: result.insertId,
              owner_amount: ownerAmount,
              company_amount: companyAmount
            });
          }
        );
      }
    );
  });
};

// ✅ get all owner earnings
export const getOwnerEarnings = (req, res) => {
  const sql = `
    SELECT 
      oe.*,
      vo.owner_name,
      v.registration_no,
      v.car_make,
      v.car_model
    FROM owner_earnings oe
    JOIN vehicle_owners vo ON oe.owner_id = vo.id
    JOIN vehicles v ON oe.vehicle_id = v.id
    ORDER BY oe.id DESC
  `;

  db.query(sql, (err, rows) => {
    if (err) return res.status(500).json(err);
    res.json(rows);
  });
};

// ✅ get owner earnings by owner
export const getOwnerEarningsByOwner = (req, res) => {
  const { owner_id } = req.params;

  const sql = `
    SELECT 
      oe.*,
      v.registration_no,
      v.car_make,
      v.car_model
    FROM owner_earnings oe
    JOIN vehicles v ON oe.vehicle_id = v.id
    WHERE oe.owner_id = ?
    ORDER BY oe.id DESC
  `;

  db.query(sql, [owner_id], (err, rows) => {
    if (err) return res.status(500).json(err);
    res.json(rows);
  });
};

// ✅ owner summary
export const getOwnerSummary = (req, res) => {
  const { owner_id } = req.params;

  const sql = `
    SELECT
      vo.id AS owner_id,
      vo.owner_name,
      COUNT(DISTINCT v.id) AS total_vehicles,
      COUNT(DISTINCT oe.booking_id) AS completed_paid_bookings,
      COALESCE(SUM(oe.booking_amount), 0) AS total_booking_amount,
      COALESCE(SUM(oe.owner_amount), 0) AS total_owner_amount,
      COALESCE(SUM(oe.company_amount), 0) AS total_company_amount,
      COALESCE(SUM(CASE WHEN oe.status='unpaid' THEN oe.owner_amount ELSE 0 END), 0) AS unpaid_owner_amount,
      COALESCE(SUM(CASE WHEN oe.status='paid' THEN oe.owner_amount ELSE 0 END), 0) AS paid_owner_amount
    FROM vehicle_owners vo
    LEFT JOIN vehicles v ON v.owner_id = vo.id
    LEFT JOIN owner_earnings oe ON oe.owner_id = vo.id
    WHERE vo.id = ?
    GROUP BY vo.id, vo.owner_name
  `;

  db.query(sql, [owner_id], (err, rows) => {
    if (err) return res.status(500).json(err);
    if (!rows.length) return res.status(404).json({ message: "Owner not found" });

    res.json(rows[0]);
  });
};

// ✅ mark owner earning as paid
export const markOwnerEarningPaid = (req, res) => {
  const { id } = req.params;

  db.query(
    `UPDATE owner_earnings SET status='paid' WHERE id = ?`,
    [id],
    (err, result) => {
      if (err) return res.status(500).json(err);
      if (result.affectedRows === 0) {
        return res.status(404).json({ message: "Owner earning not found" });
      }

      res.json({ message: "Owner earning marked as paid" });
    }
  );
};

// ✅ owner due report
export const getOwnerDueReport = (req, res) => {
  const sql = `
    SELECT
      vo.id AS owner_id,
      vo.owner_name,
      COUNT(oe.id) AS total_unpaid_bookings,
      COALESCE(SUM(oe.owner_amount), 0) AS total_unpaid_amount
    FROM vehicle_owners vo
    JOIN owner_earnings oe ON oe.owner_id = vo.id
    WHERE oe.status = 'unpaid'
    GROUP BY vo.id, vo.owner_name
    ORDER BY total_unpaid_amount DESC
  `;

  db.query(sql, (err, rows) => {
    if (err) return res.status(500).json(err);
    res.json(rows);
  });
};