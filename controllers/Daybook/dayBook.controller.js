import { db } from "../../config/db.js";

export const getDaybook = (req, res) => {
  const { date } = req.query;

  const sql = `
    SELECT *
    FROM ledgers
    WHERE DATE(created_at) = ?
    ORDER BY id DESC
  `;

  db.query(sql, [date], (err, rows) => {
    if (err) return res.status(500).json(err);

    res.json(rows);
  });
};

