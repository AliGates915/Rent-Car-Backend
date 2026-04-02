import { db } from "../../config/db.js";
import { addLedgerEntry } from "../../utils/ledger.js";

// ✅ CREATE
export const addMaintenanceLog = (req, res) => {
  const {
    vehicle_id,
    maintenance_type,
    service_date,
    km_at_service,
    cost,
    vendor_name,
    notes,
  } = req.body;

  const sql = `
    INSERT INTO vehicle_maintenance_logs
    (vehicle_id, maintenance_type_id, service_date, odometer_km, amount, vendor_name, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `;

  db.query(
    sql,
    [
      vehicle_id,
      maintenance_type, // id aa raha hai → OK
      service_date,
      km_at_service,
      cost,
      vendor_name,
      notes,
    ],
    (err, result) => {
      if (err) return res.status(500).json(err);

      db.query(`UPDATE vehicles SET status='maintenance' WHERE id=?`, [
        vehicle_id,
      ]);
      addLedgerEntry({
        entry_type: "maintenance",
        reference_id: result.insertId,
        reference_table: "vehicle_maintenance_logs",
        vehicle_id,
        credit: cost,
        description: "Vehicle maintenance",
      });
      res.json({ message: "Maintenance added", id: result.insertId });
    },
  );
};

// ✅ GET ALL
export const getMaintenanceLogs = (req, res) => {
  const sql = `
    SELECT ml.*, v.registration_no, v.car_make
    FROM vehicle_maintenance_logs ml
    JOIN vehicles v ON ml.vehicle_id = v.id
    ORDER BY ml.id DESC
  `;

  db.query(sql, (err, rows) => {
    if (err) return res.status(500).json(err);
    res.json(rows);
  });
};

// ✅ GET BY ID
export const getMaintenanceById = (req, res) => {
  const { id } = req.params;

  db.query(
    `SELECT * FROM vehicle_maintenance_logs WHERE id=?`,
    [id],
    (err, rows) => {
      if (err) return res.status(500).json(err);
      if (!rows.length) return res.status(404).json({ message: "Not found" });

      res.json(rows[0]);
    },
  );
};

// ✅ UPDATE
export const updateMaintenance = (req, res) => {
  const { id } = req.params;

  const {
    maintenance_type,
    service_date,
    km_at_service,
    cost,
    vendor_name,
    notes,
  } = req.body;

  const sql = `
    UPDATE vehicle_maintenance_logs
    SET 
      maintenance_type_id=?,
      service_date=?,
      odometer_km=?,
      amount=?,
      vendor_name=?,
      notes=?
    WHERE id=?
  `;

  db.query(
    sql,
    [
      maintenance_type,
      service_date,
      km_at_service,
      cost,
      vendor_name,
      notes,
      id,
    ],
    (err) => {
      if (err) return res.status(500).json(err);
      addLedgerEntry({
        entry_type: "maintenance",
        reference_id: result.insertId,
        reference_table: "vehicle_maintenance_logs",
        vehicle_id,
        credit: cost,
        description: "Vehicle maintenance",
      });
      res.json({ message: "Maintenance updated" });
    },
  );
};

// ✅ DELETE
export const deleteMaintenance = (req, res) => {
  const { id } = req.params;

  db.query(`DELETE FROM vehicle_maintenance_logs WHERE id=?`, [id], (err) => {
    if (err) return res.status(500).json(err);

    res.json({ message: "Maintenance deleted" });
  });
};

// ✅ COMPLETE MAINTENANCE
export const completeMaintenance = (req, res) => {
  const { vehicle_id } = req.body;

  db.query(`UPDATE vehicles SET status='available' WHERE id=?`, [vehicle_id]);

  res.json({ message: "Vehicle available now" });
};

// ✅ DUE REPORT
export const getDueMaintenance = (req, res) => {
  const sql = `
    SELECT ms.*, v.registration_no
    FROM maintenance_schedule ms
    JOIN vehicles v ON ms.vehicle_id = v.id
    WHERE ms.due_date <= CURDATE()
    AND ms.status='pending'
  `;

  db.query(sql, (err, rows) => {
    if (err) return res.status(500).json(err);
    res.json(rows);
  });
};
