import { db } from "../../config/db.js";


// CREATE
export const createAccessoryType = (req, res) => {
  const { name } = req.body;

  db.query(
    "INSERT INTO vehicle_accessory_types (name) VALUES (?)",
    [name],
    (err, result) => {
      if (err) return res.status(500).json(err);

      res.json({ message: "Accessory Type created", id: result.insertId });
    }
  );
};

// GET ALL
export const getAccessoryTypes = (req, res) => {
  db.query("SELECT * FROM vehicle_accessory_types", (err, rows) => {
    if (err) return res.status(500).json(err);

    res.json(rows);
  });
};

// UPDATE
export const updateAccessoryType = (req, res) => {
  const { id } = req.params;
  const { name, status } = req.body;

  db.query(
    "UPDATE vehicle_accessory_types SET name=?, status=? WHERE id=?",
    [name, status, id],
    (err) => {
      if (err) return res.status(500).json(err);

      res.json({ message: "Accessory Type updated" });
    }
  );
};

// DELETE
export const deleteAccessoryType = (req, res) => {
  const { id } = req.params;

  db.query(
    "DELETE FROM vehicle_accessory_types WHERE id=?",
    [id],
    (err) => {
      if (err) return res.status(500).json(err);

      res.json({ message: "Accessory Type deleted" });
    }
  );
};