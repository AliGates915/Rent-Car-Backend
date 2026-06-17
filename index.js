import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import { db } from "./config/db.js";
import authRoutes from "./routes/auth.routes.js";
import vehicleRoutes from "./routes/vehicle.routes.js";
import vehicleTypeRoutes from "./routes/Setup/vehicleType.routes.js";
import maintenanceTypeRoutes from "./routes/Setup/maintenanceType.routes.js";
import rentTypeRoutes from "./routes/Setup/rentType.routes.js";
import accessoryTypeRoutes from "./routes/Setup/accessoryType.routes.js";
import customerRoutes from "./routes/customer/customer.routes.js";
import bookingRoutes from "./routes/booking/booking.routes.js";
import handoverRoutes from "./routes/hand_over/handover.routes.js";
import returnRoutes from "./routes/return/return.routes.js";
import paymentRoutes from "./routes/payment/payment.routes.js";
import cashReceipt from "./routes/cash_receipt/cash.routes.js";
import expenseRoutes from "./routes/expense/expense.routes.js"; 
import reportsRoutes from "./routes/reports/reports.routes.js";
import maintenanceRoutes from "./routes/maintenance/maintenance.routes.js";
import ownerEarningRoutes from "./routes/owner/ownerEarning.routes.js";
import ownerRoutes from "./routes/owner/owner.routes.js";
import dayBook from "./routes/daybook/daybook.routes.js";
import { userRoutes } from "./routes/user.routes.js";

// TEMPORARILY COMMENTED OUT - Fix missing file
import dashboardRoutes from './routes/dashboard.routes.js';

dotenv.config();

await db();

const app = express();

// Configure CORS properly
app.use(cors({
  origin: ['http://localhost:5173', 'https://rent-car-frontend-20.vercel.app' , 'https://rent-car-frontend-20.vercel.app'],
  credentials: true,
   methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'], 
  allowedHeaders: ['Content-Type', 'Authorization']
}));


app.use(express.json());

// Root route handler
app.get('/', (req, res) => {
  res.json({
    message: 'Rent Car Backend API',
    status: 'online',
    version: '1.0.0',
    endpoints: '/api/{auth,users,customers,vehicles,bookings,payments,reports}'
  });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK', timestamp: new Date() });
});

// Other routes
app.use("/api/users", userRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/customers", customerRoutes);
app.use("/api/vehicles", vehicleRoutes);
app.use("/api/vehicle-types", vehicleTypeRoutes);
app.use("/api/maintenance-types", maintenanceTypeRoutes);
app.use("/api/rent-types", rentTypeRoutes);
app.use("/api/accessory-types", accessoryTypeRoutes);
app.use("/api/bookings", bookingRoutes);
app.use("/api/handover", handoverRoutes);
app.use("/api/return", returnRoutes);
app.use("/api/payments", paymentRoutes); 
app.use('/api/receipts', cashReceipt);
app.use('/api/expenses', expenseRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/maintenance', maintenanceRoutes);
app.use("/api/owner-earnings", ownerEarningRoutes);
app.use("/api/owners", ownerRoutes);
app.use("/api/daybook", dayBook);

// TEMPORARILY COMMENTED OUT - dashboard routes
app.use('/api/dashboard', dashboardRoutes);

// ✅ CORRECT 404 handler - NO '*' parameter
app.use((req, res) => {
  res.status(404).json({ 
    error: 'Route not found',
    path: req.originalUrl,
    method: req.method
  });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
