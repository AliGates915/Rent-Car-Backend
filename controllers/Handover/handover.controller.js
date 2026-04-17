import { db } from "../../config/db.js";

export const createHandover = (req, res) => {
    const {
        booking_id,
        vehicle_id,
        handed_over_by,  // Now this will be a string name
        handover_date,
        handover_time,
        km_out,
        fuel_level_out,
        vehicle_out_notes,
        customer_signature_url,
        staff_signature_url,
        accessories,
    } = req.body;

    // Check booking exists + status confirmed
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

        // Insert handover with separate date and time
        const insertHandover = `
            INSERT INTO vehicle_handover
            (booking_id, vehicle_id, handed_over_by, handover_date, handover_time,
             km_out, fuel_level_out, vehicle_out_notes,
             customer_signature_url, staff_signature_url)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;

        db.query(
            insertHandover,
            [
                booking_id,
                vehicle_id,
                handed_over_by,  // Now this is a string name
                handover_date,
                handover_time,
                km_out,
                fuel_level_out,
                vehicle_out_notes,
                customer_signature_url,
                staff_signature_url,
            ],
            (err, result) => {
                if (err) return res.status(500).json(err);

                const handover_id = result.insertId;

                // Insert accessories
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
                                        handover_date,
                                        handover_time,
                                        handed_over_by: handed_over_by
                                    });
                                }
                            );
                        }
                    );
                }
            }
        );
    });
};


export const getHandovers = (req, res) => {
    const { page = 1, limit = 10, search, status = "ongoing" } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    
    let sql = `
        SELECT 
            vh.id,
            vh.booking_id,
            vh.vehicle_id,
            vh.handed_over_by,
            vh.handover_date,
            vh.handover_time,
            vh.km_out,
            vh.fuel_level_out,
            vh.vehicle_out_notes,
            vh.customer_signature_url,
            vh.staff_signature_url,
            vh.created_at,
            vh.updated_at,
            
            -- vehicle details
            v.registration_no,
            v.car_make,
            v.car_model,
            v.car_type,
            v.rate_per_day,
            v.color,
            v.transmission_type,
            v.fuel_type,
            
            -- booking details
            b.booking_code,
            b.status AS booking_status,
            b.total_days,
            b.total_amount,
            b.advance_amount,
            b.paid_amount,
            b.date_from,
            b.date_to,
            
            -- customer details
            c.customer_name,
            c.phone_no AS customer_phone,
            c.cnic_no AS customer_cnic
            
        FROM vehicle_handover vh
        
        INNER JOIN vehicles v ON vh.vehicle_id = v.id
        INNER JOIN bookings b ON vh.booking_id = b.id
        INNER JOIN customers c ON b.customer_id = c.id
        
        WHERE 1=1
    `;
    
    const queryParams = [];
    
    if (status && status !== 'all') {
        sql += ` AND b.status = ?`;
        queryParams.push(status);
    }
    
    if (search) {
        sql += ` AND (
            b.booking_code LIKE ? OR 
            c.customer_name LIKE ? OR 
            v.registration_no LIKE ? OR
            v.car_make LIKE ? OR
            v.car_model LIKE ?
        )`;
        const searchPattern = `%${search}%`;
        queryParams.push(searchPattern, searchPattern, searchPattern, searchPattern, searchPattern);
    }
    
    sql += ` ORDER BY vh.handover_date DESC, vh.handover_time DESC`;
    
    if (limit !== 'all') {
        sql += ` LIMIT ? OFFSET ?`;
        queryParams.push(parseInt(limit), offset);
    }
    
    db.query(sql, queryParams, (err, rows) => {
        if (err) {
            console.error('Error fetching handovers:', err);
            return res.status(500).json({ 
                message: 'Database error', 
                error: err.message 
            });
        }
        
        const formattedRows = rows.map(row => ({
            id: row.id,
            booking_id: row.booking_id,
            vehicle_id: row.vehicle_id,
            handed_over_by: row.handed_over_by,
            handover_date: row.handover_date,
            handover_time: row.handover_time,
            handover_datetime: `${row.handover_date} ${row.handover_time}`, // Combined for compatibility
            km_out: parseInt(row.km_out) || 0,
            fuel_level_out: row.fuel_level_out,
            vehicle_out_notes: row.vehicle_out_notes,
            customer_signature_url: row.customer_signature_url,
            staff_signature_url: row.staff_signature_url,
            
            registration_no: row.registration_no,
            car_make: row.car_make,
            car_model: row.car_model,
            car_type: row.car_type,
            rate_per_day: parseFloat(row.rate_per_day) || 0,
            color: row.color,
            transmission_type: row.transmission_type,
            fuel_type: row.fuel_type,
            
            booking_code: row.booking_code,
            booking_status: row.booking_status,
            total_days: row.total_days,
            total_amount: parseFloat(row.total_amount) || 0,
            advance_amount: parseFloat(row.advance_amount) || 0,
            paid_amount: parseFloat(row.paid_amount) || 0,
            date_from: row.date_from,
            date_to: row.date_to,
            
            customer_name: row.customer_name,
            customer_phone: row.customer_phone,
            customer_cnic: row.customer_cnic,
            
            images: null
        }));
        
        // Fetch images (same as before)
        if (formattedRows.length > 0) {
            const vehicleIds = [...new Set(formattedRows.map(row => row.vehicle_id))];
            
            if (vehicleIds.length > 0) {
                const imageSql = `
                    SELECT vehicle_id, image_url, public_id
                    FROM vehicle_images
                    WHERE vehicle_id IN (?)
                    ORDER BY vehicle_id, id ASC
                `;
                
                db.query(imageSql, [vehicleIds], (imgErr, images) => {
                    if (!imgErr && images) {
                        const imagesByVehicle = {};
                        images.forEach(img => {
                            if (!imagesByVehicle[img.vehicle_id]) {
                                imagesByVehicle[img.vehicle_id] = [];
                            }
                            imagesByVehicle[img.vehicle_id].push({
                                url: img.image_url,
                                public_id: img.public_id
                            });
                        });
                        
                        formattedRows.forEach(row => {
                            row.images = imagesByVehicle[row.vehicle_id] || [];
                            row.image_url = row.images[0]?.url || null;
                        });
                    }
                    sendResponse(formattedRows);
                });
            } else {
                sendResponse(formattedRows);
            }
        } else {
            sendResponse(formattedRows);
        }
        
        function sendResponse(data) {
            if (limit === 'all') {
                return res.json(data);
            }
            
            let countSql = `
                SELECT COUNT(*) as total 
                FROM vehicle_handover vh
                INNER JOIN bookings b ON vh.booking_id = b.id
                WHERE 1=1
            `;
            
            const countParams = [];
            
            if (status && status !== 'all') {
                countSql += ` AND b.status = ?`;
                countParams.push(status);
            }
            
            if (search) {
                countSql += ` AND (
                    b.booking_code LIKE ? OR
                    (SELECT customer_name FROM customers WHERE id = b.customer_id) LIKE ?
                )`;
                countParams.push(`%${search}%`, `%${search}%`);
            }
            
            db.query(countSql, countParams, (err, countResult) => {
                if (err) {
                    console.error('Error counting handovers:', err);
                    return res.json({
                        data: data,
                        total: data.length,
                        page: parseInt(page),
                        limit: parseInt(limit),
                        totalPages: 1
                    });
                }
                
                const totalCount = countResult[0]?.total || 0;
                const totalPages = Math.ceil(totalCount / parseInt(limit));
                
                res.json({
                    data: data,
                    total: totalCount,
                    page: parseInt(page),
                    limit: parseInt(limit),
                    totalPages: totalPages
                });
            });
        }
    });
};