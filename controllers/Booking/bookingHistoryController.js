// backend/controllers/Booking/bookingHistoryController.js
import { db } from "../../config/db.js";

// ====================== GET BOOKING HISTORY ======================
export const getBookingHistory = (req, res) => {
  const {
    customer_id,
    vehicle_id,
    status,
    payment_status,
    date_from,
    date_to,
    search,
    page = 1,
    limit = 10
  } = req.query;

  let sql = `
    SELECT 
      b.*,
      v.registration_no,
      v.car_make,
      v.car_model,
      v.rate_per_day as vehicle_rate,
      c.customer_name,
      c.phone_no as customer_phone,
      GROUP_CONCAT(
        CONCAT(
          '{"url":"', vi.image_url, '","public_id":"', vi.public_id, '"}'
        )
      ) as images
    FROM bookings b
    JOIN vehicles v ON b.vehicle_id = v.id
    JOIN customers c ON b.customer_id = c.id
    LEFT JOIN vehicle_images vi ON v.id = vi.vehicle_id
    WHERE 1=1
  `;

  const params = [];

  // Apply filters
  if (customer_id) {
    sql += ` AND b.customer_id = ?`;
    params.push(customer_id);
  }

  if (vehicle_id) {
    sql += ` AND b.vehicle_id = ?`;
    params.push(vehicle_id);
  }

  if (status) {
    sql += ` AND b.status = ?`;
    params.push(status);
  }

  if (payment_status) {
    sql += ` AND b.payment_status = ?`;
    params.push(payment_status);
  }

  if (date_from) {
    sql += ` AND DATE(b.date_from) >= ?`;
    params.push(date_from);
  }

  if (date_to) {
    sql += ` AND DATE(b.date_to) <= ?`;
    params.push(date_to);
  }

  // Search functionality
  if (search) {
    sql += ` AND (
      b.booking_code LIKE ? OR 
      c.customer_name LIKE ? OR 
      v.car_make LIKE ? OR 
      v.car_model LIKE ? OR
      v.registration_no LIKE ?
    )`;
    const searchPattern = `%${search}%`;
    params.push(searchPattern, searchPattern, searchPattern, searchPattern, searchPattern);
  }

  // Get total count for pagination
  const countSql = `
    SELECT COUNT(DISTINCT b.id) as total 
    FROM bookings b
    JOIN vehicles v ON b.vehicle_id = v.id
    JOIN customers c ON b.customer_id = c.id
    WHERE 1=1
    ${customer_id ? ' AND b.customer_id = ?' : ''}
    ${vehicle_id ? ' AND b.vehicle_id = ?' : ''}
    ${status ? ' AND b.status = ?' : ''}
    ${payment_status ? ' AND b.payment_status = ?' : ''}
    ${date_from ? ' AND DATE(b.date_from) >= ?' : ''}
    ${date_to ? ' AND DATE(b.date_to) <= ?' : ''}
    ${search ? ` AND (
      b.booking_code LIKE ? OR 
      c.customer_name LIKE ? OR 
      v.car_make LIKE ? OR 
      v.car_model LIKE ? OR
      v.registration_no LIKE ?
    )` : ''}
  `;

  const countParams = [...params];
  
  db.query(countSql, countParams, (err, countResult) => {
    if (err) {
      console.error('Count query error:', err);
      return res.status(500).json({ error: err.message });
    }

    const total = countResult[0]?.total || 0;
    const totalPages = Math.ceil(total / limit);
    const offset = (page - 1) * limit;

    // Add pagination and ordering
    sql += ` GROUP BY b.id ORDER BY b.created_at DESC LIMIT ? OFFSET ?`;
    params.push(parseInt(limit), parseInt(offset));

    db.query(sql, params, (err, rows) => {
      if (err) {
        console.error('Data query error:', err);
        return res.status(500).json({ error: err.message });
      }

      const formatted = rows.map((b) => ({
        id: b.id,
        booking_code: b.booking_code,
        customer_id: b.customer_id,
        customer_name: b.customer_name,
        customer_phone: b.customer_phone,
        customer_email: b.customer_email,
        vehicle_id: b.vehicle_id,
        registration_no: b.registration_no,
        car_make: b.car_make,
        car_model: b.car_model,
        date_from: b.date_from,
        date_to: b.date_to,
        total_days: b.total_days,
        total_amount: parseFloat(b.total_amount || 0),
        advance_amount: parseFloat(b.advance_amount || 0),
        paid_amount: parseFloat(b.paid_amount || 0),
        security_deposit: parseFloat(b.security_deposit || 0),
        rate_per_day: parseFloat(b.rate_per_day || 0),
        status: b.status,
        payment_status: b.payment_status,
        created_at: b.created_at,
        updated_at: b.updated_at,
        images: b.images ? JSON.parse(`[${b.images}]`) : []
      }));

      res.json({
        data: formatted,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          totalPages,
          hasNext: page < totalPages,
          hasPrev: page > 1
        }
      });
    });
  });
};


// ====================== GET BOOKING STATISTICS ======================
export const getBookingStatistics = (req, res) => {
  const { period = 'month', year = new Date().getFullYear() } = req.query;

  // Build date condition based on created_at field
  let dateCondition = '';
  if (period === 'month') {
    dateCondition = `AND MONTH(created_at) = MONTH(CURDATE()) AND YEAR(created_at) = YEAR(CURDATE())`;
  } else if (period === 'year') {
    dateCondition = `AND YEAR(created_at) = ${year}`;
  }

  // Query for booking statistics based on actual schema
  const sql = `
    SELECT 
      COUNT(*) as total_bookings,
      SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_bookings,
      SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) as cancelled_bookings,
      SUM(CASE WHEN status = 'ongoing' THEN 1 ELSE 0 END) as ongoing_bookings,
      SUM(CASE WHEN status = 'confirmed' THEN 1 ELSE 0 END) as confirmed_bookings,
      SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending_bookings,
      SUM(CASE WHEN payment_status = 'paid' THEN 1 ELSE 0 END) as paid_bookings,
      SUM(CASE WHEN payment_status = 'partial' THEN 1 ELSE 0 END) as partial_bookings,
      SUM(CASE WHEN payment_status = 'unpaid' THEN 1 ELSE 0 END) as unpaid_bookings,
      COALESCE(SUM(total_amount), 0) as total_revenue,
      COALESCE(SUM(paid_amount), 0) as total_collected,
      COALESCE(SUM(advance_amount), 0) as total_advance,
      COALESCE(SUM(security_deposit), 0) as total_deposit,
      COALESCE(AVG(total_amount), 0) as average_booking_value
    FROM bookings
    WHERE 1=1 ${dateCondition}
  `;

//   console.log('Executing statistics query:', sql);

  db.query(sql, (err, rows) => {
    if (err) {
      console.error('Statistics query error:', err);
      // Return default values on error
      return res.json({
        success: true,
        total_bookings: 0,
        completed_bookings: 0,
        cancelled_bookings: 0,
        ongoing_bookings: 0,
        confirmed_bookings: 0,
        pending_bookings: 0,
        paid_bookings: 0,
        partial_bookings: 0,
        unpaid_bookings: 0,
        total_revenue: 0,
        total_collected: 0,
        total_advance: 0,
        total_deposit: 0,
        average_booking_value: 0
      });
    }

    const result = rows[0] || {};
    
    res.json({
      success: true,
      total_bookings: parseInt(result.total_bookings) || 0,
      completed_bookings: parseInt(result.completed_bookings) || 0,
      cancelled_bookings: parseInt(result.cancelled_bookings) || 0,
      ongoing_bookings: parseInt(result.ongoing_bookings) || 0,
      confirmed_bookings: parseInt(result.confirmed_bookings) || 0,
      pending_bookings: parseInt(result.pending_bookings) || 0,
      paid_bookings: parseInt(result.paid_bookings) || 0,
      partial_bookings: parseInt(result.partial_bookings) || 0,
      unpaid_bookings: parseInt(result.unpaid_bookings) || 0,
      total_revenue: parseFloat(result.total_revenue) || 0,
      total_collected: parseFloat(result.total_collected) || 0,
      total_advance: parseFloat(result.total_advance) || 0,
      total_deposit: parseFloat(result.total_deposit) || 0,
      average_booking_value: parseFloat(result.average_booking_value) || 0
    });
  });
};

// Alternative: Get statistics with date range filter
export const getBookingStatisticsByDateRange = (req, res) => {
  const { start_date, end_date } = req.query;

  let dateCondition = '';
  const params = [];

  if (start_date && end_date) {
    dateCondition = `AND DATE(created_at) BETWEEN ? AND ?`;
    params.push(start_date, end_date);
  }

  const sql = `
    SELECT 
      COUNT(*) as total_bookings,
      SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_bookings,
      SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) as cancelled_bookings,
      SUM(CASE WHEN status = 'ongoing' THEN 1 ELSE 0 END) as ongoing_bookings,
      SUM(CASE WHEN status = 'confirmed' THEN 1 ELSE 0 END) as confirmed_bookings,
      SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending_bookings,
      SUM(CASE WHEN payment_status = 'paid' THEN 1 ELSE 0 END) as paid_bookings,
      SUM(CASE WHEN payment_status = 'partial' THEN 1 ELSE 0 END) as partial_bookings,
      SUM(CASE WHEN payment_status = 'unpaid' THEN 1 ELSE 0 END) as unpaid_bookings,
      COALESCE(SUM(total_amount), 0) as total_revenue,
      COALESCE(SUM(paid_amount), 0) as total_collected,
      COALESCE(SUM(advance_amount), 0) as total_advance,
      COALESCE(SUM(security_deposit), 0) as total_deposit,
      COALESCE(AVG(total_amount), 0) as average_booking_value,
      COALESCE(SUM(CASE WHEN DATE(created_at) = CURDATE() THEN 1 ELSE 0 END), 0) as today_bookings,
      COALESCE(SUM(CASE WHEN DATE(created_at) = CURDATE() THEN total_amount ELSE 0 END), 0) as today_revenue
    FROM bookings
    WHERE 1=1 ${dateCondition}
  `;

  db.query(sql, params, (err, rows) => {
    if (err) {
      console.error('Statistics error:', err);
      return res.status(500).json({ error: err.message });
    }

    res.json(rows[0]);
  });
};

// ====================== GET CUSTOMER BOOKING HISTORY ======================
export const getCustomerBookingHistory = (req, res) => {
  const { customerId } = req.params;
  const { status, limit = 50 } = req.query;

  let sql = `
    SELECT 
      b.*,
      v.registration_no,
      v.car_make,
      v.car_model,
      GROUP_CONCAT(
        CONCAT(
          '{"url":"', vi.image_url, '","public_id":"', vi.public_id, '"}'
        )
      ) as images
    FROM bookings b
    JOIN vehicles v ON b.vehicle_id = v.id
    LEFT JOIN vehicle_images vi ON v.id = vi.vehicle_id
    WHERE b.customer_id = ?
  `;

  const params = [customerId];

  if (status) {
    sql += ` AND b.status = ?`;
    params.push(status);
  }

  sql += ` GROUP BY b.id ORDER BY b.created_at DESC LIMIT ?`;
  params.push(parseInt(limit));

  db.query(sql, params, (err, rows) => {
    if (err) {
      console.error('Customer history error:', err);
      return res.status(500).json({ error: err.message });
    }

    const formatted = rows.map((b) => ({
      ...b,
      images: b.images ? JSON.parse(`[${b.images}]`) : [],
      total_amount: parseFloat(b.total_amount || 0),
      advance_amount: parseFloat(b.advance_amount || 0),
      paid_amount: parseFloat(b.paid_amount || 0)
    }));

    res.json(formatted);
  });
};

// ====================== GET VEHICLE BOOKING HISTORY ======================
export const getVehicleBookingHistory = (req, res) => {
  const { vehicleId } = req.params;
  const { status, limit = 50 } = req.query;

  let sql = `
    SELECT 
      b.*,
      c.customer_name,
      c.phone_no as customer_phone,
      GROUP_CONCAT(
        CONCAT(
          '{"url":"', vi.image_url, '","public_id":"', vi.public_id, '"}'
        )
      ) as images
    FROM bookings b
    JOIN customers c ON b.customer_id = c.id
    LEFT JOIN vehicle_images vi ON b.vehicle_id = vi.vehicle_id
    WHERE b.vehicle_id = ?
  `;

  const params = [vehicleId];

  if (status) {
    sql += ` AND b.status = ?`;
    params.push(status);
  }

  sql += ` GROUP BY b.id ORDER BY b.created_at DESC LIMIT ?`;
  params.push(parseInt(limit));

  db.query(sql, params, (err, rows) => {
    if (err) {
      console.error('Vehicle history error:', err);
      return res.status(500).json({ error: err.message });
    }

    const formatted = rows.map((b) => ({
      ...b,
      images: b.images ? JSON.parse(`[${b.images}]`) : [],
      total_amount: parseFloat(b.total_amount || 0),
      advance_amount: parseFloat(b.advance_amount || 0),
      paid_amount: parseFloat(b.paid_amount || 0)
    }));

    res.json(formatted);
  });
};

// ====================== GET BOOKING TIMELINE ======================
export const getBookingTimeline = (req, res) => {
  const { id } = req.params;

  const sql = `
    SELECT 
      b.*,
      c.customer_name,
      v.car_make,
      v.car_model,
      v.registration_no
    FROM bookings b
    JOIN customers c ON b.customer_id = c.id
    JOIN vehicles v ON b.vehicle_id = v.id
    WHERE b.id = ?
  `;

  db.query(sql, [id], (err, rows) => {
    if (err) {
      console.error('Timeline error:', err);
      return res.status(500).json({ error: err.message });
    }
    if (rows.length === 0) {
      return res.status(404).json({ message: 'Booking not found' });
    }

    const booking = rows[0];
    
    // Get status logs if table exists
    const statusLogsSql = `
      SELECT * FROM booking_status_logs 
      WHERE booking_id = ? 
      ORDER BY changed_at ASC
    `;
    
    db.query(statusLogsSql, [id], (err, statusLogs) => {
      const timeline = [
        {
          action: 'Booking Created',
          timestamp: booking.created_at,
          details: `Booking ${booking.booking_code} was created`
        }
      ];
      
      if (statusLogs && statusLogs.length > 0) {
        statusLogs.forEach(log => {
          timeline.push({
            action: `Status Changed to ${log.to_status}`,
            timestamp: log.changed_at,
            details: `Changed from ${log.from_status} to ${log.to_status}`
          });
        });
      }
      
      res.json({
        ...booking,
        timeline,
        total_amount: parseFloat(booking.total_amount || 0),
        advance_amount: parseFloat(booking.advance_amount || 0),
        paid_amount: parseFloat(booking.paid_amount || 0)
      });
    });
  });
};

// ====================== EXPORT BOOKING HISTORY ======================
export const exportBookingHistory = (req, res) => {
  const { format = 'json', start_date, end_date, status } = req.query;

  let sql = `
    SELECT 
      b.booking_code,
      c.customer_name,
      c.phone_no as customer_phone,
      c.email as customer_email,
      v.car_make,
      v.car_model,
      v.registration_no,
      DATE(b.date_from) as start_date,
      DATE(b.date_to) as end_date,
      b.total_days,
      b.total_amount,
      b.advance_amount,
      b.paid_amount,
      b.security_deposit,
      b.status,
      b.payment_status,
      DATE(b.created_at) as booked_date
    FROM bookings b
    JOIN customers c ON b.customer_id = c.id
    JOIN vehicles v ON b.vehicle_id = v.id
    WHERE 1=1
  `;

  const params = [];

  if (start_date) {
    sql += ` AND DATE(b.created_at) >= ?`;
    params.push(start_date);
  }

  if (end_date) {
    sql += ` AND DATE(b.created_at) <= ?`;
    params.push(end_date);
  }

  if (status) {
    sql += ` AND b.status = ?`;
    params.push(status);
  }

  sql += ` ORDER BY b.created_at DESC`;

  db.query(sql, params, (err, rows) => {
    if (err) {
      console.error('Export error:', err);
      return res.status(500).json({ error: err.message });
    }

    if (format === 'csv') {
      // Convert to CSV
      const headers = [
        'Booking Code', 'Customer Name', 'Phone', 'Email', 
        'Car Make', 'Car Model', 'Registration', 'Start Date', 
        'End Date', 'Days', 'Total Amount', 'Advance', 
        'Paid', 'Deposit', 'Status', 'Payment Status', 'Booked Date'
      ];
      
      const csvRows = [headers.join(',')];

      for (const row of rows) {
        const values = [
          row.booking_code,
          `"${row.customer_name || ''}"`,
          row.customer_phone || '',
          row.customer_email || '',
          row.car_make || '',
          row.car_model || '',
          row.registration_no || '',
          row.start_date,
          row.end_date,
          row.total_days,
          row.total_amount,
          row.advance_amount,
          row.paid_amount,
          row.security_deposit,
          row.status,
          row.payment_status,
          row.booked_date
        ];
        csvRows.push(values.join(','));
      }

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=booking_history_${Date.now()}.csv`);
      return res.send(csvRows.join('\n'));
    }

    res.json(rows);
  });
};