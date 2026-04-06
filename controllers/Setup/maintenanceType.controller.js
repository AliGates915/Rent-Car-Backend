import { db } from "../../config/db.js";


// CREATE
export const createMaintenanceType = (req, res) => {
  const { name, description, default_km_interval, default_days_interval } =
    req.body;

  const sql = `
    INSERT INTO vehicle_maintenance_types 
    (name, description)
    VALUES (?, ?)
  `;

  db.query(
    sql,
    [
      name,
      description || null,
    ],
    (err, result) => {
      if (err) return res.status(500).json(err);

      res.json({ message: "Maintenance Type created", id: result.insertId });
    }
  );
};

// GET ALL
export const getMaintenanceTypes = (req, res) => {
  const { search = '' } = req.query;
  
  let query = "SELECT * FROM vehicle_maintenance_types";
  const params = [];
  
  if (search) {
    query += " WHERE name LIKE ? OR description LIKE ?";
    params.push(`%${search}%`, `%${search}%`);
  }
  
  db.query(query, params, (err, rows) => {
    if (err) return res.status(500).json(err);
    res.json(rows);
  });
};


// UPDATE
export const updateMaintenanceType = (req, res) => {
  const { id } = req.params;
  const { name, description, default_km_interval, default_days_interval, status } =
    req.body;

  const sql = `
    UPDATE vehicle_maintenance_types
    SET name=?, description=?, status=?
    WHERE id=?
  `;

  db.query(
    sql,
    [name, description, status, id],
    (err) => {
      if (err) return res.status(500).json(err);

      res.json({ message: "Maintenance Type updated" });
    }
  );
};

// DELETE
export const deleteMaintenanceType = (req, res) => {
  const { id } = req.params;

  db.query(
    "DELETE FROM vehicle_maintenance_types WHERE id=?",
    [id],
    (err) => {
      if (err) return res.status(500).json(err);

      res.json({ message: "Maintenance Type deleted" });
    }
  );
};