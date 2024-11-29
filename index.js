import express from "express";
import dotenv from "dotenv";
import mongoose from "mongoose";
// import authRouter from './routes/auth.js';
import cookieParser from "cookie-parser";
import cors from "cors";
import VehicleType from "./routes/vehicleType.js";
import RentType from "./routes/rentType.js";
import NewVehicle from "./routes/newVehicle.js";
import VehicleDetails from "./routes/vehicleDetails.js";
import VehicleMaintenance from "./routes/vehicleMaintenance.js";

const app = express();
dotenv.config();

app.use(
  cors({
    origin: ["http://localhost:3000"],
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    credentials: true,
  })
);

// Enable preflight for all routes

app.use(express.json());
app.use(cookieParser());

// Define routes with /api prefix
app.use("/vehicleType", VehicleType);
app.use("/new-vehicle", NewVehicle);
app.use("/vehicle-details", VehicleDetails);
app.use("/rentType", RentType);
app.use("/vehicleMaintenance", VehicleMaintenance);

// MongoDB connection function
const connect = async () => {
  try {
    await mongoose.connect(process.env.MONGO, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: 50000, // Increase timeout to 50 seconds
      socketTimeoutMS: 45000,
    });
    console.log("Connected to MongoDB");
  } catch (error) {
    console.error("MongoDB connection error:", error.message);
    throw new Error("Failed to connect to MongoDB");
  }
};

// MongoDB connection
connect();

// Root route for testing
app.get("/", (req, res) => {
  res.status(200).json({ message: "Hello from Vercel!" });
});

mongoose.connection.on("disconnected", () => {
  console.log("MongoDB disconnected");
});

// Global error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res
    .status(500)
    .json({ message: "Internal Server Error", error: err.message });
});

const PORT = 8000;

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});

// Export the app for Vercel
export default app;
