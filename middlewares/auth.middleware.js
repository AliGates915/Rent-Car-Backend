import jwt from "jsonwebtoken";
import { db } from "../config/db.js";
import dotenv from "dotenv";

dotenv.config();

export const protect = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ message: "No token provided" });
    }

    const token = authHeader.split(" ")[1];

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    // console.log("decode ",decoded);


    
    if (!decoded) {
      return res.status(401).json({ message: "Invalid or expired token" });
    }

    // get user from DB
    db.query(
      "SELECT id, name, email, role FROM users WHERE id = ?",
      [decoded.id],
      (err, result) => {
        if (err || result.length === 0) {
          return res.status(401).json({ message: "User not found" });
        }

        req.user = result[0]; // attach user
        next();
      }
    );
  } catch (error) {
    return res.status(401).json({ message: "Invalid or expired token" });
  }
};