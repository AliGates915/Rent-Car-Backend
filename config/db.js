// config/db.js
import mysql from "mysql2/promise";
import dotenv from "dotenv";

dotenv.config();

// Create a connection pool instead of a single connection
export const pool = mysql.createPool({
  host: process.env.DB_HOST || "shinkansen.proxy.rlwy.net",
  port: process.env.DB_PORT || 27421,
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASS,
  database: process.env.DB_NAME || "railway",
  ssl: {
    rejectUnauthorized: false,
  },
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// Test the connection
export const db = async () => {
  try {
    const connection = await pool.getConnection();
    console.log("✅ MySQL Connected Successfully");
    connection.release();
    return pool;
  } catch (error) {
    console.error("❌ DB Connection Failed:", error.message);
    process.exit(1);
  }
};


// optional helper if you need DB anywhere without re-connecting
// export const getConnection = () => connection;


// const sql = fs.readFileSync(new URL("./defaultdb.sql", import.meta.url), "utf8");

// await db.query(sql);


// export const db = mysql.createConnection({
//   host: "localhost",
//   user: "root",
//   password: "", // default XAMPP
//   database: "car_rental_system",
//   timezone: '+05:00', // Force Pakistan timezone (UTC+5)
//   dateStrings: true,  // Return dates as strings instead of Date objects

// });


// export const db = mysql.createConnection(
//   "mysql://avnadmin:AVNS__w2JLTIQud4zDQzHOG4@mysql-2fa1cd35-hacktech877-1efc.h.aivencloud.com:21068/defaultdb?ssl-mode=REQUIRED"
// );
