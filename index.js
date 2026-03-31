import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import authRoutes from "./routes/auth.routes.js";
import vehicleRoutes from "./routes/vehicle.routes.js";


dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

// app.use("/api/auth", authRoutes);
app.use("/api/vehicles", vehicleRoutes);

app.listen(5000, () => {
  console.log("🚀 Server running on port 5000");
});