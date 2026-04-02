import { db } from "../../config/db.js";


// CREATE
export const createRentType = (req, res) => {
  const { name, description } = req.body;

  db.query(
    "INSERT INTO rent_types (name, description) VALUES (?, ?)",
    [name, description || null],
    (err, result) => {
      if (err) return res.status(500).json(err);

      res.json({ message: "Rent Type created", id: result.insertId });
    }
  );
};

// GET ALL
export const getRentTypes = (req, res) => {
  db.query("SELECT * FROM rent_types", (err, rows) => {
    if (err) return res.status(500).json(err);

    res.json(rows);
  });
};

// UPDATE
export const updateRentType = (req, res) => {
  const { id } = req.params;
  const { name, description, status } = req.body;

  db.query(
    "UPDATE rent_types SET name=?, description=?, status=? WHERE id=?",
    [name, description, status, id],
    (err) => {
      if (err) return res.status(500).json(err);

      res.json({ message: "Rent Type updated" });
    }
  );
};

// DELETE
export const deleteRentType = (req, res) => {
  const { id } = req.params;

  db.query("DELETE FROM rent_types WHERE id=?", [id], (err) => {
    if (err) return res.status(500).json(err);

    res.json({ message: "Rent Type deleted" });
  });
};