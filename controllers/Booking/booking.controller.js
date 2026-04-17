import { db } from "../../config/db.js";
import { addLedgerEntry } from "../../utils/ledger.js";

// Helper function to update vehicle status based on its bookings
const updateVehicleStatus = (vehicleId, callback) => {
  // Check if vehicle has any active or future confirmed bookings
  const checkActiveBookings = `
    SELECT COUNT(*) as active_count 
    FROM bookings 
    WHERE vehicle_id = ? 
    AND status IN ('confirmed', 'ongoing')
    AND date_to >= CURDATE()
  `;
  
  db.query(checkActiveBookings, [vehicleId], (err, result) => {
    if (err) {
      console.error('Error checking active bookings:', err);
      if (callback) callback(err);
      return;
    }
    
    const hasActiveBookings = result[0].active_count > 0;
    const newStatus = hasActiveBookings ? 'booked' : 'available';
    
    // Update vehicle status
    const updateVehicleSql = `UPDATE vehicles SET status = ? WHERE id = ?`;
    db.query(updateVehicleSql, [newStatus, vehicleId], (err, updateResult) => {
      if (err) {
        console.error('Error updating vehicle status:', err);
        if (callback) callback(err);
        return;
      }
      if (callback) callback(null, newStatus);
    });
  });
};

// NEW: Check vehicle availability for specific date range
const checkVehicleAvailability = (vehicleId, dateFrom, dateTo, excludeBookingId = null, callback) => {
  let checkSql = `
    SELECT id, booking_code, date_from, date_to, status 
    FROM bookings 
    WHERE vehicle_id = ?
    AND status IN ('confirmed', 'ongoing')
    AND NOT (date_to < ? OR date_from > ?)
  `;
  
  const params = [vehicleId, dateFrom, dateTo];
  
  if (excludeBookingId) {
    checkSql += ` AND id != ?`;
    params.push(excludeBookingId);
  }
  
  checkSql += ` ORDER BY date_from ASC`;
  
  db.query(checkSql, params, (err, conflictingBookings) => {
    if (err) {
      callback(err);
      return;
    }
    
    callback(null, conflictingBookings);
  });
};

// NEW: Get vehicle availability status with details
export const getVehicleAvailability = (req, res) => {
  const { vehicle_id, date_from, date_to } = req.query;
  
  if (!vehicle_id || !date_from || !date_to) {
    return res.status(400).json({ 
      message: "Vehicle ID, start date and end date are required" 
    });
  }
  
  checkVehicleAvailability(vehicle_id, date_from, date_to, null, (err, conflictingBookings) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    
    const isAvailable = conflictingBookings.length === 0;
    
    res.json({
      success: true,
      vehicle_id: parseInt(vehicle_id),
      date_from,
      date_to,
      is_available: isAvailable,
      conflicting_bookings: conflictingBookings.map(b => ({
        id: b.id,
        booking_code: b.booking_code,
        date_from: b.date_from,
        date_to: b.date_to,
        status: b.status
      }))
    });
  });
};

// ====================== CREATE BOOKING ======================
export const createBooking = (req, res) => {
  const {
    customer_id,
    vehicle_id,
    rent_type_id,
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

  // Clean dates
  const cleanDateFrom = date_from.split("T")[0];
  const cleanDateTo = date_to.split("T")[0];

  const start = new Date(cleanDateFrom);
  const end = new Date(cleanDateTo);

  if (end < start) {
    return res.status(400).json({ message: "Invalid date range" });
  }

  // Check vehicle availability with detailed conflict info
  checkVehicleAvailability(vehicle_id, cleanDateFrom, cleanDateTo, null, (err, conflictingBookings) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }

    if (conflictingBookings.length > 0) {
      const conflicts = conflictingBookings.map(b => 
        `${b.booking_code} (${b.date_from} to ${b.date_to})`
      ).join(', ');
      
      return res.status(400).json({ 
        message: `Vehicle not available for selected dates. Conflicts with: ${conflicts}`,
        conflicts: conflictingBookings
      });
    }

    const days = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;

    const vehicleSql = `SELECT rate_per_day FROM vehicles WHERE id=?`;

    db.query(vehicleSql, [vehicle_id], (err, vehicle) => {
      if (err) return res.status(500).json(err);
      if (!vehicle.length) {
        return res.status(404).json({ message: "Vehicle not found" });
      }

      const rate = Number(vehicle[0].rate_per_day);
      
      // Calculate rental amount based on rent type
      let total_rental_amount = 0;
      let rate_multiplier = 1;
      
      const calculateTotal = () => {
        total_rental_amount = rate * days * rate_multiplier;
        const total_amount = total_rental_amount + Number(security_deposit);
        const paid_now = Number(upfront_payment || 0);
        const advance_paid = Math.min(Number(advance_amount || 0), total_rental_amount);
        const deposit_collected = Number(security_deposit || 0);
        const rental_paid = advance_paid;

        if (paid_now !== (advance_paid + deposit_collected)) {
          return res.status(400).json({
            message: "Upfront payment must equal advance amount + security deposit",
          });
        }

        let payment_status = "unpaid";
        if (rental_paid === total_rental_amount) payment_status = "paid";
        else if (rental_paid > 0) payment_status = "partial";

        const booking_code = `BK-${Date.now()}`;

        const insertSql = `
          INSERT INTO bookings
          (booking_code, customer_id, vehicle_id, rent_type_id, date_from, date_to,
           pickup_city, dropoff_city, rate_per_day, total_days, total_amount,
           advance_amount, paid_amount, security_deposit, status, payment_status)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)
        `;

        db.query(
          insertSql,
          [
            booking_code,
            customer_id,
            vehicle_id,
            rent_type_id || null,
            cleanDateFrom,
            cleanDateTo,
            pickup_city,
            dropoff_city,
            rate,
            days,
            total_amount,
            advance_paid,
            rental_paid,
            deposit_collected,
            payment_status,
          ],
          (err, result) => {
            if (err) return res.status(500).json(err);

            // Update customer balance
            db.query(
              `UPDATE customers 
               SET balance = balance + ? - ? 
               WHERE id = ?`,
              [total_rental_amount, rental_paid, customer_id],
            );

            // Insert payment records
            if (advance_paid > 0) {
              db.query(
                `INSERT INTO booking_payments 
                 (booking_id, payment_type, amount, payment_method, notes)
                 VALUES (?, 'advance', ?, 'cash', 'Advance payment for rental')`,
                [result.insertId, advance_paid],
              );
            }
            
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
              description: `Booking ${booking_code} - Rental amount${rent_type_id ? ` (${rate_multiplier}x multiplier applied)` : ''}`,
            });

            // UPDATE VEHICLE STATUS
            updateVehicleStatus(vehicle_id, (err) => {
              if (err) console.error('Error updating vehicle status:', err);
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
              rent_type_id: rent_type_id || null,
              rate_multiplier,
              booking_id: result.insertId
            });
          }
        );
      };

      // If rent_type_id is provided, get the multiplier
      if (rent_type_id) {
        db.query(`SELECT name FROM rent_types WHERE id = ? AND status = 'active'`, [rent_type_id], (err, rentType) => {
          if (err) {
            console.error('Error fetching rent type:', err);
          }
          if (rentType && rentType.length > 0) {
            const typeName = rentType[0].name.toLowerCase();
            if (typeName.includes('weekly')) {
              rate_multiplier = 0.9;
            } else if (typeName.includes('monthly')) {
              rate_multiplier = 0.8;
            }
          }
          calculateTotal();
        });
      } else {
        calculateTotal();
      }
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
    rent_type_id,
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

      // Function to calculate rate multiplier based on rent type
      const getRateMultiplier = (rentTypeId, callback) => {
        if (!rentTypeId || rentTypeId === oldBooking.rent_type_id) {
          // If rent type hasn't changed, use the same multiplier logic as before
          let multiplier = 1;
          if (oldBooking.rent_type_id) {
            db.query(`SELECT name FROM rent_types WHERE id = ?`, [oldBooking.rent_type_id], (err, rentType) => {
              if (!err && rentType && rentType.length > 0) {
                const typeName = rentType[0].name.toLowerCase();
                if (typeName.includes('weekly')) multiplier = 0.9;
                else if (typeName.includes('monthly')) multiplier = 0.8;
              }
              callback(multiplier);
            });
          } else {
            callback(1);
          }
        } else {
          // Fetch new rent type multiplier
          db.query(`SELECT name FROM rent_types WHERE id = ? AND status = 'active'`, [rentTypeId], (err, rentType) => {
            let multiplier = 1;
            if (!err && rentType && rentType.length > 0) {
              const typeName = rentType[0].name.toLowerCase();
              if (typeName.includes('weekly')) multiplier = 0.9;
              else if (typeName.includes('monthly')) multiplier = 0.8;
            }
            callback(multiplier);
          });
        }
      };

      getRateMultiplier(rent_type_id, (multiplier) => {
        const new_total = rate * days * multiplier;
        const old_total = Number(oldBooking.total_amount);
        const diff = new_total - old_total;

        const performUpdate = () => {
          const updateSql = `
            UPDATE bookings
            SET 
              date_from=?,
              date_to=?,
              pickup_city=?,
              dropoff_city=?,
              rent_type_id=?,
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
              rent_type_id || null,
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
                    description: `Booking ${oldBooking.booking_code} updated - amount adjustment${rent_type_id ? ' (rent type changed)' : ''}`,
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
                date_to: cleanDateTo,
                rent_type_id: rent_type_id || null,
                rate_multiplier: multiplier
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

  // First get the vehicle_id
  const getVehicleSql = `SELECT vehicle_id FROM bookings WHERE id=?`;
  
  db.query(getVehicleSql, [id], (err, booking) => {
    if (err) return res.status(500).json(err);
    if (!booking.length) {
      return res.status(404).json({ message: "Booking not found" });
    }

    const vehicle_id = booking[0].vehicle_id;
    
    // Update booking status
    const sql = `UPDATE bookings SET status=? WHERE id=?`;
    
    db.query(sql, [status, id], (err, result) => {
      if (err) return res.status(500).json(err);
      
      if (result.affectedRows === 0) {
        return res.status(404).json({ message: "Booking not found" });
      }

      // ✅ Update vehicle status based on active bookings
      updateVehicleStatus(vehicle_id, (err, newVehicleStatus) => {
        if (err) {
          console.error('Error updating vehicle status:', err);
        }
        
        res.json({ 
          message: `Booking ${status} successfully`,
          status: status,
          vehicle_status: newVehicleStatus
        });
      });
    });
  });
};

// ====================== CANCEL BOOKING ======================
export const cancelBooking = (req, res) => {
  const { id } = req.params;

  // First get the booking details
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

      // Reverse customer balance
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

      // ✅ UPDATE VEHICLE STATUS - after cancellation, check if vehicle becomes available
      updateVehicleStatus(oldBooking.vehicle_id, (err, newVehicleStatus) => {
        if (err) {
          console.error('Error updating vehicle status:', err);
        }
        
        res.json({ 
          message: "Booking cancelled successfully",
          booking_code: oldBooking.booking_code,
          vehicle_status: newVehicleStatus
        });
      });
    });
  });
};


// ====================== GET BOOKING BY ID ======================
export const getBookingById = (req, res) => {
  const { id } = req.params;

  const sql = `
    SELECT 
      b.*,
      c.customer_name,
      c.phone_no,
      c.cnic_no,
      v.registration_no,
      v.car_make,
      v.car_model,
      rt.name as rent_type_name,
      rt.description as rent_type_description
    FROM bookings b
    INNER JOIN customers c ON b.customer_id = c.id
    INNER JOIN vehicles v ON b.vehicle_id = v.id
    LEFT JOIN rent_types rt ON b.rent_type_id = rt.id
    WHERE b.id = ?
  `;

  db.query(sql, [id], (err, rows) => {
    if (err) return res.status(500).json(err);
    if (!rows.length) {
      return res.status(404).json({ message: "Booking not found" });
    }

    res.json(rows[0]);
  });
};

// ====================== GET ALL BOOKINGS ======================
export const getBookings = (req, res) => {
  const { page = 1, limit = 10, search, status, payment_status } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);

  let sql = `
    SELECT 
      b.*,
      c.customer_name,
      c.phone_no,
      v.registration_no,
      v.car_make,
      v.car_model,
      rt.name as rent_type_name
    FROM bookings b
    INNER JOIN customers c ON b.customer_id = c.id
    INNER JOIN vehicles v ON b.vehicle_id = v.id
    LEFT JOIN rent_types rt ON b.rent_type_id = rt.id
    WHERE 1=1
  `;

  const params = [];

  if (search) {
    sql += ` AND (b.booking_code LIKE ? OR c.customer_name LIKE ? OR v.registration_no LIKE ?)`;
    const searchPattern = `%${search}%`;
    params.push(searchPattern, searchPattern, searchPattern);
  }

  if (status) {
    sql += ` AND b.status = ?`;
    params.push(status);
  }

  if (payment_status) {
    sql += ` AND b.payment_status = ?`;
    params.push(payment_status);
  }

  sql += ` ORDER BY b.created_at DESC LIMIT ? OFFSET ?`;
  params.push(parseInt(limit), offset);

  db.query(sql, params, (err, rows) => {
    if (err) return res.status(500).json(err);

    // Get total count
    let countSql = `
      SELECT COUNT(*) as total FROM bookings b
      WHERE 1=1
    `;
    const countParams = [];
    
    if (search) {
      countSql += ` AND (b.booking_code LIKE ?)`;
      countParams.push(`%${search}%`);
    }
    if (status) {
      countSql += ` AND b.status = ?`;
      countParams.push(status);
    }
    if (payment_status) {
      countSql += ` AND b.payment_status = ?`;
      countParams.push(payment_status);
    }

    db.query(countSql, countParams, (err, countResult) => {
      if (err) return res.status(500).json(err);

      const total = countResult[0]?.total || 0;
      const totalPages = Math.ceil(total / limit);

      res.json({
        success: true,
        data: rows,
        pagination: {
          currentPage: parseInt(page),
          limit: parseInt(limit),
          total,
          totalPages,
          hasNext: parseInt(page) < totalPages,
          hasPrev: parseInt(page) > 1
        }
      });
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
  
// ====================== DELETE BOOKING WITH FULL REVERSAL ======================
export const deleteBooking = (req, res) => {
  const { id } = req.params;

  // First check if booking exists and get its details
  const getBookingSql = `
    SELECT 
      b.*,
      v.id as vehicle_id,
      v.status as vehicle_status,
      c.id as customer_id,
      c.balance as customer_balance
    FROM bookings b
    INNER JOIN vehicles v ON b.vehicle_id = v.id
    INNER JOIN customers c ON b.customer_id = c.id
    WHERE b.id = ?
  `;

  db.query(getBookingSql, [id], (err, bookings) => {
    if (err) {
      console.error('Error fetching booking:', err);
      return res.status(500).json({ error: err.message });
    }

    if (bookings.length === 0) {
      return res.status(404).json({ error: "Booking not found" });
    }

    const booking = bookings[0];

    // Check if booking can be deleted based on status
    const allowedStatusesForDeletion = ['pending', 'cancelled'];
    const cannotDeleteStatuses = ['ongoing', 'completed'];
    
    if (cannotDeleteStatuses.includes(booking.status?.toLowerCase())) {
      return res.status(400).json({
        error: "Cannot delete booking",
        message: `Booking with status '${booking.status}' cannot be deleted. Only pending or cancelled bookings can be deleted.`,
        booking_code: booking.booking_code,
        current_status: booking.status,
        suggested_action: booking.status === 'ongoing' ? 'Complete handover first' : 'Archive instead'
      });
    }

    // Get all payments for this booking (without transaction_id)
    const getPaymentsSql = `
      SELECT 
        id,
        payment_type,
        amount,
        payment_method,
        notes,
        created_at
      FROM booking_payments 
      WHERE booking_id = ?
      ORDER BY created_at ASC
    `;

    db.query(getPaymentsSql, [id], (err2, payments) => {
      if (err2) {
        console.error('Error fetching payments:', err2);
        return res.status(500).json({ error: err2.message });
      }

      const hasPayments = payments && payments.length > 0;
      const totalPaid = payments?.reduce((sum, p) => sum + parseFloat(p.amount), 0) || 0;

      // Get ledger entries
      const getLedgerSql = `
        SELECT 
          id,
          entry_type,
          debit,
          credit,
          description
        FROM ledgers
        WHERE reference_table = 'bookings' AND reference_id = ?
      `;

      db.query(getLedgerSql, [id], (err3, ledgers) => {
        if (err3) {
          console.error('Error fetching ledgers:', err3);
          return res.status(500).json({ error: err3.message });
        }

        const hasLedgerEntries = ledgers && ledgers.length > 0;

        // Start transaction for deletion
        db.beginTransaction((transactionErr) => {
          if (transactionErr) {
            return res.status(500).json({ error: transactionErr.message });
          }

          // Execute all queries in sequence
          const executeQueries = async () => {
            try {
              // 1. Reverse customer balance
              if (booking.total_amount > 0) {
                await new Promise((resolve, reject) => {
                  db.query(
                    `UPDATE customers 
                     SET balance = balance - ? 
                     WHERE id = ?`,
                    [booking.total_amount - (booking.paid_amount || 0), booking.customer_id],
                    (err, result) => {
                      if (err) reject(err);
                      else resolve(result);
                    }
                  );
                });
              }

              // 2. Create reversal ledger entries for all existing ledgers
              if (hasLedgerEntries) {
                for (const ledger of ledgers) {
                  await new Promise((resolve, reject) => {
                    const reversalSql = `
                      INSERT INTO ledgers
                      (entry_type, reference_id, reference_table, customer_id, vehicle_id, debit, credit, description, created_at)
                      VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())
                    `;
                    
                    db.query(reversalSql, [
                      'deletion_reversal',
                      booking.id,
                      'bookings',
                      booking.customer_id,
                      booking.vehicle_id,
                      ledger.credit, // Reverse credit to debit
                      ledger.debit,   // Reverse debit to credit
                      `DELETION: ${ledger.description} (Reversed)`
                    ], (err) => {
                      if (err) reject(err);
                      else resolve();
                    });
                  });
                }
                
                // Delete original ledger entries
                await new Promise((resolve, reject) => {
                  db.query("DELETE FROM ledgers WHERE reference_table = 'bookings' AND reference_id = ?", [id], (err) => {
                    if (err) reject(err);
                    else resolve();
                  });
                });
              }

              // 3. Create reversal entries for payments and delete them
              if (hasPayments) {
                for (const payment of payments) {
                  // Add reversal payment record
                  await new Promise((resolve, reject) => {
                    const reversalPaymentSql = `
                      INSERT INTO booking_payments
                      (booking_id, payment_type, amount, payment_method, notes, created_at)
                      VALUES (?, 'reversal', ?, ?, ?, NOW())
                    `;
                    
                    db.query(reversalPaymentSql, [
                      booking.id,
                      payment.amount,
                      payment.payment_method || 'system',
                      `Payment reversal for booking deletion - Original: ${payment.notes || payment.payment_type} (ID: ${payment.id})`
                    ], (err) => {
                      if (err) reject(err);
                      else resolve();
                    });
                  });
                }
                
                // Delete original payments
                await new Promise((resolve, reject) => {
                  db.query("DELETE FROM booking_payments WHERE booking_id = ?", [id], (err) => {
                    if (err) reject(err);
                    else resolve();
                  });
                });
              }

              // 4. Update vehicle status back to available
              await new Promise((resolve, reject) => {
                const updateVehicleSql = `
                  UPDATE vehicles 
                  SET status = 'available' 
                  WHERE id = ?
                `;
                db.query(updateVehicleSql, [booking.vehicle_id], (err) => {
                  if (err) reject(err);
                  else resolve();
                });
              });

              // 5. Delete the booking
              await new Promise((resolve, reject) => {
                db.query("DELETE FROM bookings WHERE id = ?", [id], (err) => {
                  if (err) reject(err);
                  else resolve();
                });
              });

              // Commit transaction
              db.commit((commitErr) => {
                if (commitErr) {
                  return db.rollback(() => {
                    res.status(500).json({ error: commitErr.message });
                  });
                }

                res.json({
                  success: true,
                  message: hasPayments ? "Booking deleted successfully with all payments reversed" : "Booking deleted successfully",
                  deleted_booking: {
                    id: parseInt(id),
                    booking_code: booking.booking_code,
                    customer_id: booking.customer_id,
                    vehicle_id: booking.vehicle_id,
                    status: booking.status,
                    original_total_amount: booking.total_amount,
                    original_paid_amount: booking.paid_amount,
                    had_payments: hasPayments,
                    total_payments_reversed: totalPaid,
                    had_ledger_entries: hasLedgerEntries
                  }
                });
              });

            } catch (error) {
              db.rollback(() => {
                console.error('Transaction error:', error);
                res.status(500).json({ 
                  error: "Failed to delete booking", 
                  details: error.message,
                  reversal_status: "failed"
                });
              });
            }
          };

          executeQueries();
        });
      });
    });
  });
};




