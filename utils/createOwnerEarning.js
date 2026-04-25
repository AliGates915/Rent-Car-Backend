// backend/utils/createOwnerEarning.js
import { pool } from "../config/db.js";

export const createOwnerEarningIfEligible = async (bookingId) => {
  try {
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

    // Get booking details using pool
    const [rows] = await pool.query(sql, [bookingId]);
    
    if (!rows || rows.length === 0) {
      console.error('No booking found for owner earning:', bookingId);
      return;
    }

    const booking = rows[0];

    // Only create owner earning if booking is completed AND payment is paid
    if (booking.status !== "completed" || booking.payment_status !== "paid") {
      console.log(`Owner earning not created: booking ${bookingId} status=${booking.status}, payment=${booking.payment_status}`);
      return;
    }

    if (!booking.owner_id) {
      console.log(`Owner earning not created: No owner for vehicle ${booking.vehicle_id}`);
      return;
    }

    // Check for duplicate
    const [existing] = await pool.query(
      `SELECT id FROM owner_earnings WHERE booking_id=? LIMIT 1`,
      [bookingId]
    );
    
    if (existing && existing.length > 0) {
      console.log(`Owner earning already exists for booking ${bookingId}`);
      return;
    }

    const total = Number(booking.total_amount);
    const percentage = Number(booking.owner_percentage || 80);

    const owner_amount = (total * percentage) / 100;
    const company_amount = total - owner_amount;

    // Insert owner earning
    await pool.query(
      `INSERT INTO owner_earnings
      (owner_id, vehicle_id, booking_id, booking_code, total_days, booking_amount, owner_percentage, owner_amount, company_amount, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
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

    console.log(`Owner earning created for booking ${bookingId}: Owner gets ${owner_amount}, Company gets ${company_amount}`);
    
  } catch (error) {
    console.error('Error in createOwnerEarningIfEligible:', error);
    throw error;
  }
};