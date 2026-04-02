import { db } from "../../config/db.js";



// CREATE
export const createVehicleType = (req, res) => {
  const { name, description } = req.body;

  const sql = `INSERT INTO vehicle_types (name, description) VALUES (?, ?)`;

  db.query(sql, [name, description || null], (err, result) => {
    if (err) return res.status(500).json(err);

    res.json({ message: "Vehicle Type created", id: result.insertId });
  });
};

// GET ALL
export const getVehicleTypes = (req, res) => {
  db.query("SELECT * FROM vehicle_types", (err, rows) => {
    if (err) return res.status(500).json(err);

    res.json(rows);
  });
};

// GET BY ID
export const getVehicleTypeById = (req, res) => {
  const { id } = req.params;

  db.query(
    "SELECT * FROM vehicle_types WHERE id=?",
    [id],
    (err, rows) => {
      if (err) return res.status(500).json(err);
      if (rows.length === 0)
        return res.status(404).json({ message: "Not found" });

      res.json(rows[0]);
    }
  );
};

// UPDATE
export const updateVehicleType = (req, res) => {
  const { id } = req.params;
  const { name, description, status } = req.body;

  const sql = `
    UPDATE vehicle_types
    SET name=?, description=?, status=?
    WHERE id=?
  `;

  db.query(sql, [name, description, status, id], (err) => {
    if (err) return res.status(500).json(err);

    res.json({ message: "Vehicle Type updated" });
  });
};

// DELETE
export const deleteVehicleType = (req, res) => {
  const { id } = req.params;

  db.query("DELETE FROM vehicle_types WHERE id=?", [id], (err) => {
    if (err) return res.status(500).json(err);

    res.json({ message: "Vehicle Type deleted" });
  });
};