// backend/controllers/vehicleHandover.controller.js
import { pool } from "../../config/db.js";
import { addLedgerEntry } from "../../utils/ledger.js";

// Helper function to validate handover date
const validateHandoverDate = (handoverDate, bookingStartDate) => {
  const handover = new Date(handoverDate);
  const startDate = new Date(bookingStartDate);
  handover.setHours(0, 0, 0, 0);
  startDate.setHours(0, 0, 0, 0);
  
  if (handover > startDate) {
    throw new Error("Handover date cannot be after booking start date");
  }
  return handover <= startDate;
};

// Helper function to get vehicle with images
const getVehicleWithImages = async (vehicleId) => {
  const [vehicleRows] = await pool.query(`
    SELECT 
      v.*,
      GROUP_CONCAT(
        JSON_OBJECT('url', vi.image_url, 'public_id', vi.public_id)
      ) as images_json
    FROM vehicles v
    LEFT JOIN vehicle_images vi ON v.id = vi.vehicle_id
    WHERE v.id = ?
    GROUP BY v.id
  `, [vehicleId]);
  
  if (vehicleRows.length === 0) return null;
  
  const vehicle = vehicleRows[0];
  return {
    ...vehicle,
    images: vehicle.images_json ? JSON.parse(`[${vehicle.images_json}]`) : [],
    rate_per_day: Number(vehicle.rate_per_day) || 0
  };
};

// ====================== CREATE HANDOVER ======================
export const createHandover = async (req, res) => {
  const connection = await pool.getConnection();
  
  try {
    const {
      booking_id,
      vehicle_id,
      handed_over_by,
      handover_date,
      handover_time,
      km_out,
      fuel_level_out,
      vehicle_out_notes,
      accessories,
    } = req.body;

    // Validate required fields
    const requiredFields = { booking_id, vehicle_id, handed_over_by, handover_date, handover_time };
    const missingFields = Object.entries(requiredFields)
      .filter(([_, value]) => !value)
      .map(([key]) => key);
    
    if (missingFields.length > 0) {
      await connection.rollback();
      connection.release();
      return res.status(400).json({
        success: false,
        message: `Missing required fields: ${missingFields.join(', ')}`
      });
    }

    await connection.beginTransaction();

    // Check booking exists, is confirmed, and not already handed over
    const [bookingResult] = await connection.query(`
      SELECT b.*, v.owner_id, v.owner_percentage, v.rate_per_day
      FROM bookings b
      INNER JOIN vehicles v ON b.vehicle_id = v.id
      WHERE b.id = ? AND b.status = 'confirmed'
    `, [booking_id]);

    if (bookingResult.length === 0) {
      await connection.rollback();
      connection.release();
      return res.status(400).json({
        success: false,
        message: "Booking not confirmed or not found"
      });
    }

    const booking = bookingResult[0];

    // Check if handover already exists for this booking
    const [existingHandover] = await connection.query(
      `SELECT id FROM vehicle_handover WHERE booking_id = ?`,
      [booking_id]
    );

    if (existingHandover.length > 0) {
      await connection.rollback();
      connection.release();
      return res.status(400).json({
        success: false,
        message: "Handover already exists for this booking"
      });
    }

    // Validate handover date
    const handoverDateObj = new Date(handover_date);
    const startDateObj = new Date(booking.date_from);
    handoverDateObj.setHours(0, 0, 0, 0);
    startDateObj.setHours(0, 0, 0, 0);
    
    if (handoverDateObj > startDateObj) {
      await connection.rollback();
      connection.release();
      return res.status(400).json({
        success: false,
        message: "Handover date cannot be after booking start date"
      });
    }

    // Validate odometer reading
    let kmOutNum = null;
    if (km_out !== null && km_out !== undefined && km_out !== '') {
      kmOutNum = parseInt(km_out);
      if (isNaN(kmOutNum)) {
        await connection.rollback();
        connection.release();
        return res.status(400).json({
          success: false,
          message: "Valid odometer reading is required"
        });
      }
    }

    // Insert handover
    const [handoverResult] = await connection.query(`
      INSERT INTO vehicle_handover
      (booking_id, vehicle_id, handed_over_by, handover_date, handover_time,
       km_out, fuel_level_out, vehicle_out_notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      booking_id, 
      vehicle_id, 
      handed_over_by, 
      handover_date, 
      handover_time,
      kmOutNum,
      fuel_level_out, 
      vehicle_out_notes || null,
    ]);

    const handover_id = handoverResult.insertId;

    // Insert accessories if any
    if (accessories && accessories.length > 0) {
      const validAccessories = accessories.filter(acc => acc.accessory_type_id);
      if (validAccessories.length > 0) {
        const values = validAccessories.map((acc) => [
          handover_id,
          acc.accessory_type_id,
          acc.is_given ? 1 : 0,
          acc.remarks || null
        ]);

        await connection.query(
          `INSERT INTO vehicle_handover_accessories
           (handover_id, accessory_type_id, is_given, remarks)
           VALUES ?`,
          [values]
        );
      }
    }

    // Add ledger entry - PASS THE CONNECTION
    await addLedgerEntry({
      entry_type: "handover",
      reference_id: handover_id,
      reference_table: "vehicle_handover",
      customer_id: booking.customer_id,
      vehicle_id: vehicle_id,
      credit: Number(booking.total_amount) || 0,
      description: `Booking ${booking.booking_code} - Vehicle handover`
    }, connection); // ← Pass the connection here

    // Update booking status to ongoing
    await connection.query(
      `UPDATE bookings SET status = 'ongoing', updated_at = NOW() WHERE id = ?`,
      [booking_id]
    );

    // Update vehicle status to booked
    await connection.query(
      `UPDATE vehicles SET status = 'booked' WHERE id = ?`,
      [vehicle_id]
    );

    await connection.commit();
    connection.release();

    res.status(201).json({
      success: true,
      message: "Vehicle handed over successfully",
      handover_id,
      handover_date,
      handover_time,
      handed_over_by,
      booking_code: booking.booking_code
    });

  } catch (error) {
    await connection.rollback();
    connection.release();
    console.error('Error in createHandover:', error);
    res.status(500).json({ 
      success: false,
      message: "Failed to create handover", 
      error: error.message 
    });
  }
};

export const getHandovers = async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 10, 
      search, 
      status = "ongoing",
      date_from,
      date_to,
      vehicle_id,
      customer_id
    } = req.query;
    
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const limitValue = parseInt(limit);
    
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
        v.registration_no,
        v.car_make,
        v.car_model,
        v.car_type,
        v.rate_per_day,
        v.color,
        v.transmission_type,
        v.fuel_type,
        b.booking_code,
        b.status AS booking_status,
        b.total_days,
        b.total_amount,
        b.advance_amount,
        b.paid_amount,
        b.date_from,
        b.date_to,
        c.customer_name,
        c.phone_no AS customer_phone,
        c.cnic_no AS customer_cnic,
        vi.image_url,
        vi.public_id
      FROM vehicle_handover vh
      INNER JOIN vehicles v ON vh.vehicle_id = v.id
      INNER JOIN bookings b ON vh.booking_id = b.id
      INNER JOIN customers c ON b.customer_id = c.id
      LEFT JOIN vehicle_images vi ON vh.vehicle_id = vi.vehicle_id
      WHERE 1=1
    `;
    
    const queryParams = [];
    
    if (status && status !== 'all') {
      sql += ` AND b.status = ?`;
      queryParams.push(status);
    }
    
    if (search) {
      sql += ` AND (b.booking_code LIKE ? OR c.customer_name LIKE ? OR v.registration_no LIKE ?)`;
      const searchPattern = `%${search}%`;
      queryParams.push(searchPattern, searchPattern, searchPattern);
    }
    
    if (date_from) {
      sql += ` AND DATE(vh.handover_date) >= ?`;
      queryParams.push(date_from);
    }
    
    if (date_to) {
      sql += ` AND DATE(vh.handover_date) <= ?`;
      queryParams.push(date_to);
    }
    
    if (vehicle_id) {
      sql += ` AND vh.vehicle_id = ?`;
      queryParams.push(vehicle_id);
    }
    
    if (customer_id) {
      sql += ` AND b.customer_id = ?`;
      queryParams.push(customer_id);
    }
    
    sql += ` ORDER BY vh.handover_date DESC, vh.handover_time DESC LIMIT ? OFFSET ?`;
    queryParams.push(limitValue, offset);
    
    const [rows] = await pool.query(sql, queryParams);
    
    // Get total count (same as before)
    let countSql = `SELECT COUNT(*) as total FROM vehicle_handover vh INNER JOIN bookings b ON vh.booking_id = b.id WHERE 1=1`;
    const countParams = [];
    
    if (status && status !== 'all') {
      countSql += ` AND b.status = ?`;
      countParams.push(status);
    }
    
    if (search) {
      countSql += ` AND b.booking_code LIKE ?`;
      countParams.push(`%${search}%`);
    }
    
    const [countResult] = await pool.query(countSql, countParams);
    const totalCount = countResult[0]?.total || 0;
    const totalPages = Math.ceil(totalCount / limitValue);
    
    // Group images by handover/vehicle
    const handoverMap = new Map();
    
    rows.forEach(row => {
      const handoverId = row.id;
      
      if (!handoverMap.has(handoverId)) {
        handoverMap.set(handoverId, {
          id: row.id,
          booking_id: row.booking_id,
          vehicle_id: row.vehicle_id,
          handed_over_by: row.handed_over_by,
          handover_date: row.handover_date,
          handover_time: row.handover_time,
          handover_datetime: `${row.handover_date} ${row.handover_time}`,
          km_out: parseInt(row.km_out) || 0,
          fuel_level_out: row.fuel_level_out,
          vehicle_out_notes: row.vehicle_out_notes,
          customer_signature_url: row.customer_signature_url,
          staff_signature_url: row.staff_signature_url,
          vehicle: {
            id: row.vehicle_id,
            registration_no: row.registration_no,
            car_make: row.car_make,
            car_model: row.car_model,
            car_type: row.car_type,
            rate_per_day: parseFloat(row.rate_per_day) || 0,
            color: row.color,
            transmission_type: row.transmission_type,
            fuel_type: row.fuel_type
          },
          booking: {
            id: row.booking_id,
            code: row.booking_code,
            status: row.booking_status,
            total_days: row.total_days,
            total_amount: parseFloat(row.total_amount) || 0,
            advance_amount: parseFloat(row.advance_amount) || 0,
            paid_amount: parseFloat(row.paid_amount) || 0,
            date_from: row.date_from,
            date_to: row.date_to
          },
          customer: {
            name: row.customer_name,
            phone: row.customer_phone,
            cnic: row.customer_cnic
          },
          images: [],
          created_at: row.created_at,
          updated_at: row.updated_at
        });
      }
      
      // Add image if exists
      if (row.image_url) {
        handoverMap.get(handoverId).images.push({
          url: row.image_url,
          public_id: row.public_id
        });
      }
    });
    
    const formattedRows = Array.from(handoverMap.values());
    
    res.json({
      success: true,
      data: formattedRows,
      pagination: {
        page: parseInt(page),
        limit: limitValue,
        total: totalCount,
        totalPages,
        hasNext: parseInt(page) < totalPages,
        hasPrev: parseInt(page) > 1
      }
    });
    
  } catch (error) {
    console.error('Error in getHandovers:', error);
    res.status(500).json({ 
      success: false,
      message: "Failed to fetch handovers", 
      error: error.message 
    });
  }
};

// ====================== GET HANDOVER BY ID ======================
export const getHandoverById = async (req, res) => {
  try {
    const { id } = req.params;
    
    const [rows] = await pool.query(`
      SELECT 
        vh.*,
        b.booking_code,
        b.status as booking_status,
        b.date_from,
        b.date_to,
        b.total_amount,
        b.customer_id,
        v.registration_no,
        v.car_make,
        v.car_model,
        v.rate_per_day,
        c.customer_name,
        c.phone_no as customer_phone,
        c.cnic_no as customer_cnic
      FROM vehicle_handover vh
      INNER JOIN bookings b ON vh.booking_id = b.id
      INNER JOIN vehicles v ON vh.vehicle_id = v.id
      INNER JOIN customers c ON b.customer_id = c.id
      WHERE vh.id = ?
    `, [id]);
    
    if (rows.length === 0) {
      return res.status(404).json({ 
        success: false,
        message: "Handover not found" 
      });
    }
    
    const handover = rows[0];
    
    // Get accessories for this handover
    const [accessories] = await pool.query(`
      SELECT 
        vha.*,
        vat.name as accessory_name
      FROM vehicle_handover_accessories vha
      LEFT JOIN vehicle_accessory_types vat ON vha.accessory_type_id = vat.id
      WHERE vha.handover_id = ?
    `, [id]);
    
    res.json({
      success: true,
      data: {
        id: handover.id,
        booking_id: handover.booking_id,
        vehicle_id: handover.vehicle_id,
        handed_over_by: handover.handed_over_by,
        handover_date: handover.handover_date,
        handover_time: handover.handover_time,
        km_out: parseInt(handover.km_out) || 0,
        fuel_level_out: handover.fuel_level_out,
        vehicle_out_notes: handover.vehicle_out_notes,
        km_in: parseInt(handover.km_in) || null,
        fuel_level_in: handover.fuel_level_in,
        vehicle_in_notes: handover.vehicle_in_notes,
        return_date: handover.return_date,
        return_time: handover.return_time,
        customer_signature_url: handover.customer_signature_url,
        staff_signature_url: handover.staff_signature_url,
        booking: {
          code: handover.booking_code,
          status: handover.booking_status,
          date_from: handover.date_from,
          date_to: handover.date_to,
          total_amount: parseFloat(handover.total_amount) || 0,
          customer_id: handover.customer_id,
          customer_name: handover.customer_name,
          customer_phone: handover.customer_phone,
          customer_cnic: handover.customer_cnic
        },
        vehicle: {
          registration_no: handover.registration_no,
          car_make: handover.car_make,
          car_model: handover.car_model,
          rate_per_day: parseFloat(handover.rate_per_day) || 0
        },
        accessories: accessories.map(acc => ({
          id: acc.id,
          accessory_type_id: acc.accessory_type_id,
          accessory_name: acc.accessory_name,
          is_given: acc.is_given === 1,
          remarks: acc.remarks
        })),
        created_at: handover.created_at,
        updated_at: handover.updated_at
      }
    });
    
  } catch (error) {
    console.error('Error in getHandoverById:', error);
    res.status(500).json({ 
      success: false,
      message: "Failed to fetch handover", 
      error: error.message 
    });
  }
};

// ====================== GET HANDOVER STATISTICS ======================
export const getHandoverStatistics = async (req, res) => {
  try {
    const { from_date, to_date } = req.query;
    
    let dateCondition = "WHERE 1=1";
    const params = [];
    
    if (from_date && to_date) {
      dateCondition += ` AND DATE(vh.handover_date) BETWEEN ? AND ?`;
      params.push(from_date, to_date);
    }
    
    const [stats] = await pool.query(`
      SELECT 
        COUNT(*) as total_handovers,
        COUNT(CASE WHEN vh.return_date IS NOT NULL THEN 1 END) as completed_returns,
        COUNT(CASE WHEN vh.return_date IS NULL THEN 1 END) as active_handovers,
        SUM(b.total_amount) as total_booking_value,
        AVG(vh.km_out) as avg_km_out,
        SUM(CASE WHEN vh.km_in IS NOT NULL THEN (vh.km_in - vh.km_out) ELSE 0 END) as total_km_driven,
        COUNT(DISTINCT vh.vehicle_id) as unique_vehicles_used
      FROM vehicle_handover vh
      INNER JOIN bookings b ON vh.booking_id = b.id
      ${dateCondition}
    `, params);
    
    const result = stats[0] || {};
    
    res.json({
      success: true,
      statistics: {
        total_handovers: Number(result.total_handovers) || 0,
        completed_returns: Number(result.completed_returns) || 0,
        active_handovers: Number(result.active_handovers) || 0,
        total_booking_value: Number(result.total_booking_value) || 0,
        average_km_out: Number(result.avg_km_out) || 0,
        total_km_driven: Number(result.total_km_driven) || 0,
        unique_vehicles_used: Number(result.unique_vehicles_used) || 0,
        completion_rate: result.total_handovers > 0 
          ? ((result.completed_returns / result.total_handovers) * 100).toFixed(2)
          : 0
      }
    });
    
  } catch (error) {
    console.error('Error in getHandoverStatistics:', error);
    res.status(500).json({ 
      success: false,
      message: "Failed to fetch handover statistics", 
      error: error.message 
    });
  }
};

// ====================== GET PENDING HANDOVERS ======================
export const getPendingHandovers = async (req, res) => {
  try {
    const { search } = req.query;
    
    let sql = `
      SELECT 
        vh.id,
        vh.booking_id,
        vh.vehicle_id,
        vh.handed_over_by,
        vh.handover_date,
        vh.handover_time,
        b.booking_code,
        b.date_from,
        b.date_to,
        c.customer_name,
        v.registration_no,
        v.car_make,
        v.car_model
      FROM vehicle_handover vh
      INNER JOIN bookings b ON vh.booking_id = b.id
      INNER JOIN customers c ON b.customer_id = c.id
      INNER JOIN vehicles v ON vh.vehicle_id = v.id
      WHERE vh.return_date IS NULL
    `;
    
    const params = [];
    
    if (search) {
      sql += ` AND (b.booking_code LIKE ? OR c.customer_name LIKE ? OR v.registration_no LIKE ?)`;
      const searchPattern = `%${search}%`;
      params.push(searchPattern, searchPattern, searchPattern);
    }
    
    sql += ` ORDER BY vh.handover_date DESC, vh.handover_time DESC`;
    
    const [rows] = await pool.query(sql, params);
    
    res.json({
      success: true,
      data: rows,
      count: rows.length
    });
    
  } catch (error) {
    console.error('Error in getPendingHandovers:', error);
    res.status(500).json({ 
      success: false,
      message: "Failed to fetch pending handovers", 
      error: error.message 
    });
  }
};


// Get handovers by booking ID
export const getHandoversByBooking = async (req, res) => {
    try {
        const { booking_id } = req.params;
        
        const [rows] = await pool.query(`
            SELECT * FROM vehicle_handover
            WHERE booking_id = ?
            ORDER BY handover_date DESC, handover_time DESC
        `, [booking_id]);
        
        res.json(rows.map(row => ({
            ...row,
            km_out: parseInt(row.km_out) || 0
        })));
        
    } catch (error) {
        console.error('Error in getHandoversByBooking:', error);
        res.status(500).json({ 
            message: "Failed to fetch handovers", 
            error: error.message 
        });
    }
};

// Update handover (for vehicle return)
export const updateHandover = async (req, res) => {
    try {
        const { id } = req.params;
        const {
            km_in,
            fuel_level_in,
            vehicle_in_notes,
            return_date,
            return_time
        } = req.body;
        
        // Get handover details first
        const [handoverRows] = await pool.query(
            `SELECT * FROM vehicle_handover WHERE id = ?`,
            [id]
        );
        
        if (handoverRows.length === 0) {
            return res.status(404).json({ message: "Handover not found" });
        }
        
        const handover = handoverRows[0];
        
        // Update handover with return details
        await pool.query(`
            UPDATE vehicle_handover 
            SET km_in = ?,
                fuel_level_in = ?,
                vehicle_in_notes = ?,
                return_date = ?,
                return_time = ?,
                updated_at = NOW()
            WHERE id = ?
        `, [km_in, fuel_level_in, vehicle_in_notes, return_date, return_time, id]);
        
        // Update booking status to completed
        await pool.query(
            `UPDATE bookings SET status = 'completed' WHERE id = ?`,
            [handover.booking_id]
        );
        
        // Update vehicle status back to available
        await pool.query(
            `UPDATE vehicles SET status = 'available' WHERE id = ?`,
            [handover.vehicle_id]
        );
        
        res.json({
            message: "Vehicle return recorded successfully",
            handover_id: id
        });
        
    } catch (error) {
        console.error('Error in updateHandover:', error);
        res.status(500).json({ 
            message: "Failed to update handover", 
            error: error.message 
        });
    }
};

// Delete handover
export const deleteHandover = async (req, res) => {
    try {
        const { id } = req.params;
        
        // Get handover details first
        const [handoverRows] = await pool.query(
            `SELECT * FROM vehicle_handover WHERE id = ?`,
            [id]
        );
        
        if (handoverRows.length === 0) {
            return res.status(404).json({ message: "Handover not found" });
        }
        
        const handover = handoverRows[0];
        
        // Delete accessories first (foreign key constraint)
        await pool.query(
            `DELETE FROM vehicle_handover_accessories WHERE handover_id = ?`,
            [id]
        );
        
        // Delete handover
        await pool.query(`DELETE FROM vehicle_handover WHERE id = ?`, [id]);
        
        // Optionally revert booking and vehicle status
        await pool.query(
            `UPDATE bookings SET status = 'confirmed' WHERE id = ?`,
            [handover.booking_id]
        );
        
        await pool.query(
            `UPDATE vehicles SET status = 'available' WHERE id = ?`,
            [handover.vehicle_id]
        );
        
        res.json({ 
            message: "Handover deleted successfully",
            handover_id: id
        });
        
    } catch (error) {
        console.error('Error in deleteHandover:', error);
        res.status(500).json({ 
            message: "Failed to delete handover", 
            error: error.message 
        });
    }
};