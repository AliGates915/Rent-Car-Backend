import { db } from "../../config/db.js";

// ====================== CREATE OWNER ======================
export const createOwner = (req, res) => {
  const {
    owner_name,
    father_name,
    cnic_no,
    phone_no,
    alternate_phone,
    address,
    city,
    notes,
    status = "active"
  } = req.body;

  if (!owner_name) {
    return res.status(400).json({ message: "owner_name is required" });
  }

  const sql = `
    INSERT INTO vehicle_owners
    (owner_name, father_name, cnic_no, phone_no, alternate_phone, address, city, notes, status, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

  db.query(
    sql,
    [
      owner_name,
      father_name,
      cnic_no,
      phone_no,
      alternate_phone,
      address,
      city,
      notes,
      status,
      req.user?.id || null
    ],
    (err, result) => {
      if (err) return res.status(500).json(err);

      res.status(201).json({
        message: "Owner created successfully",
        id: result.insertId
      });
    }
  );
};

// ====================== GET ALL OWNERS ======================
export const getOwners = (req, res) => {
  const sql = `
    SELECT * FROM vehicle_owners
    ORDER BY id DESC
  `;

  db.query(sql, (err, rows) => {
    if (err) return res.status(500).json(err);
    res.json(rows);
  });
};

// ====================== GET OWNER BY ID ======================
export const getOwnerById = (req, res) => {
  const { id } = req.params;

  db.query(
    `SELECT * FROM vehicle_owners WHERE id=?`,
    [id],
    (err, rows) => {
      if (err) return res.status(500).json(err);
      if (!rows.length) {
        return res.status(404).json({ message: "Owner not found" });
      }

      res.json(rows[0]);
    }
  );
};

// ====================== UPDATE OWNER ======================
export const updateOwner = (req, res) => {
  const { id } = req.params;

  const {
    owner_name,
    father_name,
    cnic_no,
    phone_no,
    alternate_phone,
    address,
    city,
    notes,
    status
  } = req.body;

  const sql = `
    UPDATE vehicle_owners
    SET
      owner_name=?,
      father_name=?,
      cnic_no=?,
      phone_no=?,
      alternate_phone=?,
      address=?,
      city=?,
      notes=?,
      status=?,
      updated_by=?,
      updated_at = NOW()
    WHERE id=?
  `;

  db.query(
    sql,
    [
      owner_name,
      father_name,
      cnic_no,
      phone_no,
      alternate_phone,
      address,
      city,
      notes,
      status,
      req.user?.id || null,
      id
    ],
    (err, result) => {
      if (err) return res.status(500).json(err);

      if (result.affectedRows === 0) {
        return res.status(404).json({ message: "Owner not found" });
      }

      res.json({ message: "Owner updated successfully" });
    }
  );
};

// ====================== DELETE OWNER ======================
export const deleteOwner = (req, res) => {
  const { id } = req.params;

  // 🔥 check if owner is linked with vehicle
  db.query(
    `SELECT id FROM vehicles WHERE owner_id=? LIMIT 1`,
    [id],
    (err, rows) => {
      if (err) return res.status(500).json(err);

      if (rows.length > 0) {
        return res.status(400).json({
          message: "Cannot delete owner. Vehicles are assigned."
        });
      }

      db.query(
        `DELETE FROM vehicle_owners WHERE id=?`,
        [id],
        (err2, result) => {
          if (err2) return res.status(500).json(err2);

          if (result.affectedRows === 0) {
            return res.status(404).json({ message: "Owner not found" });
          }

          res.json({ message: "Owner deleted successfully" });
        }
      );
    }
  );
};