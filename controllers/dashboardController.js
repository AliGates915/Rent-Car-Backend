import { pool } from '../config/db.js';


// Helper function to get previous period stats
const getPreviousPeriodStats = async () => {
  try {
    const [customers] = await pool.query(
      "SELECT COUNT(*) as total FROM customers WHERE status = 'active' AND created_at < DATE_SUB(NOW(), INTERVAL 30 DAY)"
    );
    const [vehicles] = await pool.query(
      "SELECT COUNT(*) as total FROM vehicles WHERE status = 'available' AND created_at < DATE_SUB(NOW(), INTERVAL 30 DAY)"
    );
    const [bookings] = await pool.query(
      "SELECT COUNT(*) as total FROM bookings WHERE DATE(created_at) BETWEEN DATE_SUB(NOW(), INTERVAL 60 DAY) AND DATE_SUB(NOW(), INTERVAL 30 DAY)"
    );
    const [revenue] = await pool.query(
      "SELECT COALESCE(SUM(amount), 0) as total FROM booking_payments WHERE payment_type IN ('advance', 'payment') AND DATE(created_at) BETWEEN DATE_SUB(NOW(), INTERVAL 60 DAY) AND DATE_SUB(NOW(), INTERVAL 30 DAY)"
    );
    
    return {
      customers: customers[0]?.total || 0,
      vehicles: vehicles[0]?.total || 0,
      bookings: bookings[0]?.total || 0,
      revenue: revenue[0]?.total || 0
    };
  } catch (error) {
    console.error('Error fetching previous period stats:', error);
    return { customers: 0, vehicles: 0, bookings: 0, revenue: 0 };
  }
};

// Helper function to calculate percentage change
const calculateChange = (current, previous) => {
  if (previous === 0) return current > 0 ? '+100%' : '0%';
  const change = ((current - previous) / previous) * 100;
  return `${change >= 0 ? '+' : ''}${change.toFixed(1)}%`;
};

// Get dashboard statistics
export const getDashboardStats = async (req, res) => {
  try {
    // Execute all queries in parallel - FIXED destructuring
    const [
      customersResult,
      vehiclesResult,
      bookingsResult,
      paymentsResult,
      revenueResult,
      recentBookingsResult,
      recentPaymentsResult,
      upcomingBookingsResult,
      vehicleUtilizationResult,
      availableVehiclesResult,
      todayRevenueResult,
      monthRevenueResult
    ] = await Promise.all([
      pool.query("SELECT COUNT(*) as total FROM customers WHERE status = 'active'"),
      pool.query("SELECT COUNT(*) as total FROM vehicles WHERE status = 'available'"),
      pool.query(`
        SELECT 
          COUNT(*) as total,
          SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
          SUM(CASE WHEN status = 'confirmed' THEN 1 ELSE 0 END) as confirmed,
          SUM(CASE WHEN status = 'ongoing' THEN 1 ELSE 0 END) as ongoing,
          SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
          SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) as cancelled
        FROM bookings 
        WHERE DATE(created_at) >= DATE_SUB(NOW(), INTERVAL 30 DAY)
      `),
      pool.query(`
        SELECT 
          COUNT(*) as total_transactions,
          COALESCE(SUM(amount), 0) as total_amount,
          COALESCE(SUM(CASE WHEN payment_type = 'advance' THEN amount ELSE 0 END), 0) as total_advances,
          COALESCE(SUM(CASE WHEN payment_type = 'payment' THEN amount ELSE 0 END), 0) as total_payments,
          COALESCE(SUM(CASE WHEN payment_type = 'security_deposit' THEN amount ELSE 0 END), 0) as total_deposits
        FROM booking_payments 
        WHERE DATE(created_at) >= DATE_SUB(NOW(), INTERVAL 30 DAY)
      `),
      pool.query(`
        SELECT 
          DATE(created_at) as date,
          COALESCE(SUM(CASE WHEN payment_type IN ('advance', 'payment') THEN amount ELSE 0 END), 0) as daily_revenue
        FROM booking_payments 
        WHERE DATE(created_at) >= DATE_SUB(NOW(), INTERVAL 30 DAY)
        GROUP BY DATE(created_at)
        ORDER BY date ASC
      `),
      pool.query(`
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
      `),
      pool.query(`
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
      `),
      pool.query(`
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
      `),
      pool.query(`
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
      `),
      pool.query("SELECT COUNT(*) as total FROM vehicles WHERE status = 'available' AND is_active = 1"),
      pool.query(`
        SELECT COALESCE(SUM(amount), 0) as total
        FROM booking_payments 
        WHERE payment_type IN ('advance', 'payment')
        AND DATE(created_at) = CURDATE()
      `),
      pool.query(`
        SELECT COALESCE(SUM(amount), 0) as total
        FROM booking_payments 
        WHERE payment_type IN ('advance', 'payment')
        AND MONTH(created_at) = MONTH(CURDATE())
        AND YEAR(created_at) = YEAR(CURDATE())
      `)
    ]);

    // Extract the actual data from the result arrays
    const customers = customersResult[0][0] || { total: 0 };
    const vehicles = vehiclesResult[0][0] || { total: 0 };
    const bookings = bookingsResult[0][0] || { total: 0, pending: 0, confirmed: 0, ongoing: 0, completed: 0, cancelled: 0 };
    const payments = paymentsResult[0][0] || { total_transactions: 0, total_amount: 0, total_advances: 0, total_payments: 0, total_deposits: 0 };
    const revenue = revenueResult[0] || [];
    const recentBookings = recentBookingsResult[0] || [];
    const recentPayments = recentPaymentsResult[0] || [];
    const upcomingBookings = upcomingBookingsResult[0] || [];
    const vehicleUtilization = vehicleUtilizationResult[0] || [];
    const availableVehicles = availableVehiclesResult[0][0] || { total: 0 };
    const todayRevenue = todayRevenueResult[0][0] || { total: 0 };
    const monthRevenue = monthRevenueResult[0][0] || { total: 0 };

    // Get previous period stats for comparison
    const previousPeriodStats = await getPreviousPeriodStats();

    // Transform revenue data
    const revenueData = revenue.map(row => ({
      date: row.date,
      revenue: Number(row.daily_revenue)
    }));

    const dashboardData = {
      summaryCards: [
        {
          label: 'Total Customers',
          value: customers?.total || 0,
          change: calculateChange(customers?.total || 0, previousPeriodStats.customers),
          icon: 'Users'
        },
        {
          label: 'Active Vehicles',
          value: vehicles?.total || 0,
          change: calculateChange(vehicles?.total || 0, previousPeriodStats.vehicles),
          icon: 'CarFront'
        },
        {
          label: 'Total Bookings (30d)',
          value: bookings?.total || 0,
          change: calculateChange(bookings?.total || 0, previousPeriodStats.bookings),
          icon: 'ClipboardList'
        },
        {
          label: 'Total Revenue (30d)',
          value: Number(payments?.total_amount || 0),
          change: calculateChange(payments?.total_amount || 0, previousPeriodStats.revenue),
          icon: 'CreditCard',
          isCurrency: true
        }
      ],
      quickStats: [
        { 
          label: 'Active Customers', 
          value: customers?.total || 0, 
          icon: 'Users',
          trend: '+12%'
        },
        { 
          label: 'Available Vehicles', 
          value: availableVehicles?.total || 0, 
          icon: 'CarFront',
          trend: '-5%'
        },
        { 
          label: 'Active Bookings', 
          value: bookings?.ongoing || 0, 
          icon: 'ClipboardList',
          trend: '+8%'
        },
        { 
          label: 'Today\'s Revenue', 
          value: Number(todayRevenue?.total || 0), 
          icon: 'CreditCard',
          trend: '+23%',
          isCurrency: true
        }
      ],
      bookingsBreakdown: {
        pending: bookings?.pending || 0,
        confirmed: bookings?.confirmed || 0,
        ongoing: bookings?.ongoing || 0,
        completed: bookings?.completed || 0,
        cancelled: bookings?.cancelled || 0
      },
      paymentStats: {
        totalTransactions: payments?.total_transactions || 0,
        totalAdvances: Number(payments?.total_advances || 0),
        totalPayments: Number(payments?.total_payments || 0),
        totalDeposits: Number(payments?.total_deposits || 0),
        monthRevenue: Number(monthRevenue?.total || 0)
      },
      revenueData: revenueData,
      recentBookings: recentBookings.map(booking => ({
        id: booking.id,
        code: booking.booking_code,
        customer: booking.customer_name,
        vehicle: `${booking.vehicle_name} (${booking.registration_no})`,
        dateFrom: booking.date_from,
        dateTo: booking.date_to,
        amount: Number(booking.total_amount),
        paid: Number(booking.paid_amount),
        status: booking.status,
        paymentStatus: booking.payment_status
      })),
      recentPayments: recentPayments.map(payment => ({
        id: payment.id,
        bookingCode: payment.booking_code,
        customer: payment.customer_name,
        type: payment.payment_type,
        amount: Number(payment.amount),
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
        amount: Number(booking.total_amount)
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
    
    const [results] = await pool.query(query, [period]);
    
    // Format results to ensure numeric values
    const formattedResults = results.map(row => ({
      date: row.date,
      revenue: Number(row.revenue),
      deposits: Number(row.deposits)
    }));
    
    res.json({
      success: true,
      data: formattedResults
    });
  } catch (error) {
    console.error('Revenue chart error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
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
    
    const [results] = await pool.query(query, [limit, limit, limit, limit]);
    
    // Format the results and parse JSON details
    const formattedResults = results.map(result => ({
      ...result,
      event_date: result.event_date,
      details: typeof result.details === 'string' ? JSON.parse(result.details) : result.details
    }));
    
    res.json({
      success: true,
      data: formattedResults
    });
  } catch (error) {
    console.error('Timeline events error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
};

// Get booking statistics by status
export const getBookingStats = async (req, res) => {
  try {
    const query = `
      SELECT 
        status,
        COUNT(*) as count,
        COALESCE(SUM(total_amount), 0) as total_value
      FROM bookings
      GROUP BY status
    `;
    
    const [results] = await pool.query(query);
    
    // Format results with proper numeric values
    const formattedResults = results.map(row => ({
      status: row.status,
      count: Number(row.count),
      total_value: Number(row.total_value)
    }));
    
    res.json({
      success: true,
      data: formattedResults
    });
  } catch (error) {
    console.error('Booking stats error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
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
    
    const [results] = await pool.query(query);
    
    // Format results
    const formattedResults = results.map(row => ({
      status: row.status,
      count: Number(row.count)
    }));
    
    res.json({
      success: true,
      data: formattedResults
    });
  } catch (error) {
    console.error('Vehicle stats error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
};