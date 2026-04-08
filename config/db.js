import mysql from "mysql2";

export const db = mysql.createConnection({
  host: "localhost",
  user: "root",
  password: "", // default XAMPP
  database: "car_rental_system",
  timezone: '+05:00', // Force Pakistan timezone (UTC+5)
  dateStrings: true,  // Return dates as strings instead of Date objects
  
});

db.connect((err) => {
  if (err) {
    console.log("❌ DB Error:", err);
  } else {
    console.log("✅ MySQL Connected");
  }
});