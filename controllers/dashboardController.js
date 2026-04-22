import { db } from '../config/db.js';

// Get dashboard statistics
export const getDashboardStats = async (req, res) => {
  try {
    const queries = {
      // Get total customers
      customers: `SELECT COUNT(*) as total FROM customers WHERE status = 'active'`,
      
      // Get total vehicles
      vehicles: `SELECT COUNT(*) as total FROM vehicles WHERE status = 'available'`,
      
      // Get bookings by status
      bookings: `
        SELECT 
          COUNT(*) as total,
          SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
          SUM(CASE WHEN status = 'confirmed' THEN 1 ELSE 0 END) as confirmed,
          SUM(CASE WHEN status = 'ongoing' THEN 1 ELSE 0 END) as ongoing,
          SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
          SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) as cancelled
        FROM bookings 
        WHERE DATE(created_at) >= DATE_SUB(NOW(), INTERVAL 30 DAY)
      `,
      
      // Get payment statistics
      payments: `
        SELECT 
          COUNT(*) as total_transactions,
          COALESCE(SUM(amount), 0) as total_amount,
          COALESCE(SUM(CASE WHEN payment_type = 'advance' THEN amount ELSE 0 END), 0) as total_advances,
          COALESCE(SUM(CASE WHEN payment_type = 'payment' THEN amount ELSE 0 END), 0) as total_payments,
          COALESCE(SUM(CASE WHEN payment_type = 'security_deposit' THEN amount ELSE 0 END), 0) as total_deposits
        FROM booking_payments 
        WHERE DATE(created_at) >= DATE_SUB(NOW(), INTERVAL 30 DAY)
      `,
      
      // Get revenue by period (last 30 days)
      revenue: `
        SELECT 
          DATE(created_at) as date,
          COALESCE(SUM(CASE WHEN payment_type IN ('advance', 'payment') THEN amount ELSE 0 END), 0) as daily_revenue
        FROM booking_payments 
        WHERE DATE(created_at) >= DATE_SUB(NOW(), INTERVAL 30 DAY)
        GROUP BY DATE(created_at)
        ORDER BY date ASC
      `,
      
      // Get recent bookings
      recentBookings: `
        SELECT 
          b.id,
          b.booking_code,
          b.date_from,
          b.date_to,
          b.total_amount,
          b.paid_amount,
          b.status,
          b.payment_status,
          c.customer_name,
          CONCAT(v.car_make, ' ', v.car_model) as vehicle_name,
          v.registration_no
        FROM bookings b
        JOIN customers c ON b.customer_id = c.id
        JOIN vehicles v ON b.vehicle_id = v.id
        ORDER BY b.created_at DESC
        LIMIT 10
      `,
      
      // Get recent payments
      recentPayments: `
        SELECT 
          bp.id,
          bp.payment_type,
          bp.amount,
          bp.payment_method,
          bp.created_at,
          b.booking_code,
          c.customer_name
        FROM booking_payments bp
        JOIN bookings b ON bp.booking_id = b.id
        JOIN customers c ON b.customer_id = c.id
        ORDER BY bp.created_at DESC
        LIMIT 10
      `,
      
      // Get upcoming bookings (next 7 days)
      upcomingBookings: `
        SELECT 
          b.id,
          b.booking_code,
          b.date_from,
          b.date_to,
          b.total_amount,
          c.customer_name,
          CONCAT(v.car_make, ' ', v.car_model) as vehicle_name,
          v.registration_no
        FROM bookings b
        JOIN customers c ON b.customer_id = c.id
        JOIN vehicles v ON b.vehicle_id = v.id
        WHERE b.date_from BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 7 DAY)
        AND b.status NOT IN ('completed', 'cancelled')
        ORDER BY b.date_from ASC
        LIMIT 10
      `,
      
      // Get vehicle utilization
      vehicleUtilization: `
        SELECT 
          v.id,
          CONCAT(v.car_make, ' ', v.car_model) as vehicle_name,
          v.registration_no,
          COUNT(b.id) as total_bookings,
          SUM(CASE WHEN b.status = 'ongoing' THEN 1 ELSE 0 END) as active_bookings,
          SUM(CASE WHEN b.status IN ('confirmed', 'ongoing') THEN 
            DATEDIFF(b.date_to, b.date_from) + 1 
          ELSE 0 END) as total_days_booked
        FROM vehicles v
        LEFT JOIN bookings b ON v.id = b.vehicle_id 
          AND b.status IN ('confirmed', 'ongoing')
          AND b.date_from <= CURDATE()
        WHERE v.status = 'available'
        GROUP BY v.id
        ORDER BY total_bookings DESC
        LIMIT 5
      `,
      
      // Get total available vehicles
      availableVehicles: `
        SELECT COUNT(*) as total 
        FROM vehicles 
        WHERE status = 'available' AND is_active = 1
      `,
      
      // Get today's revenue
      todayRevenue: `
        SELECT COALESCE(SUM(amount), 0) as total
        FROM booking_payments 
        WHERE payment_type IN ('advance', 'payment')
        AND DATE(created_at) = CURDATE()
      `,
      
      // Get this month's revenue
      monthRevenue: `
        SELECT COALESCE(SUM(amount), 0) as total
        FROM booking_payments 
        WHERE payment_type IN ('advance', 'payment')
        AND MONTH(created_at) = MONTH(CURDATE())
        AND YEAR(created_at) = YEAR(CURDATE())
      `
    };

    // Execute all queries in parallel
    const results = await Promise.all(
      Object.values(queries).map(query => 
        new Promise((resolve, reject) => {
          db.query(query, (err, result) => {
            if (err) reject(err);
            else resolve(result);
          });
        })
      )
    );

    const [
      customers,
      vehicles,
      bookings,
      payments,
      revenue,
      recentBookings,
      recentPayments,
      upcomingBookings,
      vehicleUtilization,
      availableVehicles,
      todayRevenue,
      monthRevenue
    ] = results;

    // Calculate change percentages (comparing with previous period)
    const previousPeriodStats = await getPreviousPeriodStats();
    
    const dashboardData = {
      summaryCards: [
        {
          label: 'Total Customers',
          value: customers[0]?.total || 0,
          change: calculateChange(customers[0]?.total || 0, previousPeriodStats.customers),
          icon: 'Users'
        },
        {
          label: 'Active Vehicles',
          value: vehicles[0]?.total || 0,
          change: calculateChange(vehicles[0]?.total || 0, previousPeriodStats.vehicles),
          icon: 'CarFront'
        },
        {
          label: 'Total Bookings (30d)',
          value: bookings[0]?.total || 0,
          change: calculateChange(bookings[0]?.total || 0, previousPeriodStats.bookings),
          icon: 'ClipboardList'
        },
        {
          label: 'Total Revenue (30d)',
          value: payments[0]?.total_amount || 0,
          change: calculateChange(payments[0]?.total_amount || 0, previousPeriodStats.revenue),
          icon: 'CreditCard',
          isCurrency: true
        }
      ],
      quickStats: [
        { 
          label: 'Active Customers', 
          value: customers[0]?.total || 0, 
          icon: 'Users',
          trend: '+12%'
        },
        { 
          label: 'Available Vehicles', 
          value: availableVehicles[0]?.total || 0, 
          icon: 'CarFront',
          trend: '-5%'
        },
        { 
          label: 'Active Bookings', 
          value: bookings[0]?.ongoing || 0, 
          icon: 'ClipboardList',
          trend: '+8%'
        },
        { 
          label: 'Today\'s Revenue', 
          value: todayRevenue[0]?.total || 0, 
          icon: 'CreditCard',
          trend: '+23%',
          isCurrency: true
        }
      ],
      bookingsBreakdown: {
        pending: bookings[0]?.pending || 0,
        confirmed: bookings[0]?.confirmed || 0,
        ongoing: bookings[0]?.ongoing || 0,
        completed: bookings[0]?.completed || 0,
        cancelled: bookings[0]?.cancelled || 0
      },
      paymentStats: {
        totalTransactions: payments[0]?.total_transactions || 0,
        totalAdvances: payments[0]?.total_advances || 0,
        totalPayments: payments[0]?.total_payments || 0,
        totalDeposits: payments[0]?.total_deposits || 0,
        monthRevenue: monthRevenue[0]?.total || 0
      },
      revenueData: revenue.map(row => ({
        date: row.date,
        revenue: row.daily_revenue
      })),
      recentBookings: recentBookings.map(booking => ({
        id: booking.id,
        code: booking.booking_code,
        customer: booking.customer_name,
        vehicle: `${booking.vehicle_name} (${booking.registration_no})`,
        dateFrom: booking.date_from,
        dateTo: booking.date_to,
        amount: booking.total_amount,
        paid: booking.paid_amount,
        status: booking.status,
        paymentStatus: booking.payment_status
      })),
      recentPayments: recentPayments.map(payment => ({
        id: payment.id,
        bookingCode: payment.booking_code,
        customer: payment.customer_name,
        type: payment.payment_type,
        amount: payment.amount,
        method: payment.payment_method,
        date: payment.created_at
      })),
      upcomingBookings: upcomingBookings.map(booking => ({
        id: booking.id,
        code: booking.booking_code,
        customer: booking.customer_name,
        vehicle: `${booking.vehicle_name} (${booking.registration_no})`,
        dateFrom: booking.date_from,
        dateTo: booking.date_to,
        amount: booking.total_amount
      })),
      vehicleUtilization: vehicleUtilization.map(vehicle => ({
        id: vehicle.id,
        name: vehicle.vehicle_name,
        registration: vehicle.registration_no,
        totalBookings: vehicle.total_bookings || 0,
        activeBookings: vehicle.active_bookings || 0,
        utilizationRate: vehicle.total_days_booked > 0 ? 
          Math.min(100, (vehicle.total_days_booked / 30) * 100) : 0
      }))
    };

    res.json({
      success: true,
      data: dashboardData
    });

  } catch (error) {
    console.error('Dashboard stats error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch dashboard statistics',
      error: error.message 
    });
  }
};

// Helper function to get previous period statistics
const getPreviousPeriodStats = async () => {
  return new Promise((resolve, reject) => {
    const queries = {
      customers: `SELECT COUNT(*) as total FROM customers WHERE status = 'active' AND DATE(created_at) < DATE_SUB(NOW(), INTERVAL 30 DAY)`,
      vehicles: `SELECT COUNT(*) as total FROM vehicles WHERE status = 'available' AND DATE(created_at) < DATE_SUB(NOW(), INTERVAL 30 DAY)`,
      bookings: `SELECT COUNT(*) as total FROM bookings WHERE DATE(created_at) < DATE_SUB(NOW(), INTERVAL 30 DAY)`,
      revenue: `SELECT COALESCE(SUM(amount), 0) as total FROM booking_payments WHERE payment_type IN ('advance', 'payment') AND DATE(created_at) < DATE_SUB(NOW(), INTERVAL 30 DAY)`
    };

    Promise.all(
      Object.values(queries).map(query => 
        new Promise((resolveQuery, rejectQuery) => {
          db.query(query, (err, result) => {
            if (err) rejectQuery(err);
            else resolveQuery(result[0]?.total || 0);
          });
        })
      )
    ).then(results => {
      resolve({
        customers: results[0],
        vehicles: results[1],
        bookings: results[2],
        revenue: results[3]
      });
    }).catch(reject);
  });
};

// Helper function to calculate percentage change
const calculateChange = (current, previous) => {
  if (previous === 0) return '+100%';
  const change = ((current - previous) / previous) * 100;
  const sign = change >= 0 ? '+' : '';
  return `${sign}${change.toFixed(1)}%`;
};

// Get revenue chart data
export const getRevenueChart = async (req, res) => {
  const { period = '30' } = req.query;
  
  try {
    const query = `
      SELECT 
        DATE(created_at) as date,
        COALESCE(SUM(CASE WHEN payment_type IN ('advance', 'payment') THEN amount ELSE 0 END), 0) as revenue,
        COALESCE(SUM(CASE WHEN payment_type = 'security_deposit' THEN amount ELSE 0 END), 0) as deposits
      FROM booking_payments 
      WHERE DATE(created_at) >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
      GROUP BY DATE(created_at)
      ORDER BY date ASC
    `;
    
    db.query(query, [period], (err, results) => {
      if (err) {
        return res.status(500).json({ success: false, error: err.message });
      }
      
      res.json({
        success: true,
        data: results
      });
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// Get recent timeline events
export const getTimelineEvents = async (req, res) => {
  const { limit = 20 } = req.query;
  
  try {
    const query = `
      (SELECT 
        'booking' as event_type,
        b.created_at as event_date,
        CONCAT('New booking created: ', b.booking_code) as description,
        JSON_OBJECT('booking_code', b.booking_code, 'customer_id', b.customer_id, 'amount', b.total_amount) as details
      FROM bookings b
      ORDER BY b.created_at DESC
      LIMIT ?)
      
      UNION ALL
      
      (SELECT 
        'payment' as event_type,
        bp.created_at as event_date,
        CONCAT('Payment received: ', bp.payment_type, ' of ', FORMAT(bp.amount, 0)) as description,
        JSON_OBJECT('booking_id', bp.booking_id, 'amount', bp.amount, 'type', bp.payment_type) as details
      FROM booking_payments bp
      ORDER BY bp.created_at DESC
      LIMIT ?)
      
      UNION ALL
      
      (SELECT 
        'customer' as event_type,
        c.created_at as event_date,
        CONCAT('New customer registered: ', c.customer_name) as description,
        JSON_OBJECT('customer_id', c.id, 'name', c.customer_name, 'phone', c.phone_no) as details
      FROM customers c
      ORDER BY c.created_at DESC
      LIMIT ?)
      
      ORDER BY event_date DESC
      LIMIT ?
    `;
    
    db.query(query, [limit, limit, limit, limit], (err, results) => {
      if (err) {
        return res.status(500).json({ success: false, error: err.message });
      }
      
      // Format the results
      const formattedResults = results.map(result => ({
        ...result,
        details: typeof result.details === 'string' ? JSON.parse(result.details) : result.details
      }));
      
      res.json({
        success: true,
        data: formattedResults
      });
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// Get booking statistics by status
export const getBookingStats = async (req, res) => {
  try {
    const query = `
      SELECT 
        status,
        COUNT(*) as count,
        SUM(total_amount) as total_value
      FROM bookings
      GROUP BY status
    `;
    
    db.query(query, (err, results) => {
      if (err) {
        return res.status(500).json({ success: false, error: err.message });
      }
      
      res.json({
        success: true,
        data: results
      });
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// Get vehicle status distribution
export const getVehicleStats = async (req, res) => {
  try {
    const query = `
      SELECT 
        status,
        COUNT(*) as count
      FROM vehicles
      GROUP BY status
    `;
    
    db.query(query, (err, results) => {
      if (err) {
        return res.status(500).json({ success: false, error: err.message });
      }
      
      res.json({
        success: true,
        data: results
      });
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};