import { db } from "../../config/db.js";

export const createHandover = (req, res) => {
    const {
        booking_id,
        vehicle_id,
        handed_over_by,
        km_out,
        fuel_level_out,
        vehicle_out_notes,
        customer_signature_url,
        staff_signature_url,
        accessories, // array
    } = req.body;

    // 🔍 Step 1: check booking exists + status confirmed
    const checkBooking = `
    SELECT * FROM bookings 
    WHERE id = ? AND status = 'confirmed'
  `;

    db.query(checkBooking, [booking_id], (err, bookingResult) => {
        if (err) return res.status(500).json(err);

        if (bookingResult.length === 0) {
            return res.status(400).json({
                message: "Booking not confirmed or not found",
            });
        }

        // 🚗 Step 2: insert handover
        const insertHandover = `
      INSERT INTO vehicle_handover
      (booking_id, vehicle_id, handed_over_by, handover_datetime,
       km_out, fuel_level_out, vehicle_out_notes,
       customer_signature_url, staff_signature_url)
      VALUES (?, ?, ?, NOW(), ?, ?, ?, ?, ?)
    `;

        db.query(
            insertHandover,
            [
                booking_id,
                vehicle_id,
                handed_over_by,
                km_out,
                fuel_level_out,
                vehicle_out_notes,
                customer_signature_url,
                staff_signature_url,
            ],
            (err, result) => {
                if (err) return res.status(500).json(err);

                const handover_id = result.insertId;

                // 🧰 Step 3: insert accessories (optional)
                if (accessories && accessories.length > 0) {
                    const values = accessories.map((acc) => [
                        handover_id,
                        acc.accessory_type_id,
                        acc.is_given,
                        acc.remarks || null,
                    ]);

                    const insertAccessories = `
            INSERT INTO vehicle_handover_accessories
            (handover_id, accessory_type_id, is_given, remarks)
            VALUES ?
          `;

                    db.query(insertAccessories, [values], (err) => {
                        if (err) return res.status(500).json(err);

                        updateStatus();
                    });
                } else {
                    updateStatus();
                }

                // 🔁 Step 4: update booking + vehicle
                function updateStatus() {
                    db.query(
                        `UPDATE bookings SET status='ongoing' WHERE id=?`,
                        [booking_id],
                        (err) => {
                            if (err) return res.status(500).json(err);

                            db.query(
                                `UPDATE vehicles SET status='booked' WHERE id=?`,
                                [vehicle_id],
                                (err) => {
                                    if (err) return res.status(500).json(err);

                                    res.json({
                                        message: "Vehicle handed over successfully",
                                        handover_id,
                                    });
                                },
                            );
                        },
                    );
                }
            },
        );
    });
};

export const getHandovers = (req, res) => {
    const sql = `
        SELECT 
        vh.*, 

        -- vehicle
        v.registration_no,
        v.car_make,
        v.car_model,
        v.car_type,
        v.rate_per_day,
        v.color,
        v.transmission_type,
        v.fuel_type,  

        -- booking
        b.status AS booking_status,
        b.total_days,
        b.total_amount,
        b.advance_amount,
        b.paid_amount,

        -- images
        GROUP_CONCAT(
            CONCAT(
            '{"url":"', vi.image_url, '","public_id":"', vi.public_id, '"}'
            )
        ) as images

        FROM vehicle_handover vh

        JOIN vehicles v ON vh.vehicle_id = v.id
        JOIN bookings b ON vh.booking_id = b.id

        LEFT JOIN vehicle_images vi ON v.id = vi.vehicle_id

        GROUP BY vh.id
        ORDER BY vh.id DESC
  `;

    db.query(sql, (err, rows) => {
        if (err) return res.status(500).json(err);

        res.json(rows);
    });
};
