// backend/controllers/vehicleMaintenance.controller.js
import { pool } from "../../config/db.js";
import { addLedgerEntry } from "../../utils/ledger.js";

// ✅ CREATE
export const addMaintenanceLog = async (req, res) => {
  try {
    const {
      vehicle_id,
      maintenance_type,
      service_date,
      km_at_service,
      cost,
      vendor_name,
      notes,
    } = req.body;

    // Validate required fields
    if (!vehicle_id || !maintenance_type || !service_date || !km_at_service || !cost) {
      return res.status(400).json({ 
        message: "Missing required fields: vehicle_id, maintenance_type, service_date, km_at_service, cost" 
      });
    }

    const sql = `
      INSERT INTO vehicle_maintenance_logs
      (vehicle_id, maintenance_type_id, service_date, odometer_km, amount, vendor_name, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `;

    const [result] = await pool.query(sql, [
      vehicle_id,
      maintenance_type,
      service_date,
      km_at_service,
      cost,
      vendor_name || null,
      notes || null,
    ]);

    // Update vehicle status to maintenance
    await pool.query(`UPDATE vehicles SET status = 'maintenance' WHERE id = ?`, [vehicle_id]);

    // Add ledger entry
    await addLedgerEntry({
      entry_type: "maintenance",
      reference_id: result.insertId,
      reference_table: "vehicle_maintenance_logs",
      vehicle_id: vehicle_id,
      credit: cost,
      debit: 0,
      description: `Vehicle maintenance - ${vendor_name ? `Vendor: ${vendor_name}` : ''}`
    });

    res.json({ 
      message: "Maintenance added successfully", 
      id: result.insertId 
    });
  } catch (error) {
    console.error('Error in addMaintenanceLog:', error);
    res.status(500).json({ error: error.message });
  }
};

// ✅ GET ALL
export const getMaintenanceLogs = async (req, res) => {
  try {
    const { vehicle_id, from_date, to_date } = req.query;
    
    let sql = `
      SELECT ml.*, v.registration_no, v.car_make, v.car_model
      FROM vehicle_maintenance_logs ml
      JOIN vehicles v ON ml.vehicle_id = v.id
      WHERE 1=1
    `;
    
    const params = [];
    
    if (vehicle_id) {
      sql += ` AND ml.vehicle_id = ?`;
      params.push(vehicle_id);
    }
    
    if (from_date) {
      sql += ` AND DATE(ml.service_date) >= ?`;
      params.push(from_date);
    }
    
    if (to_date) {
      sql += ` AND DATE(ml.service_date) <= ?`;
      params.push(to_date);
    }
    
    sql += ` ORDER BY ml.service_date DESC, ml.id DESC`;

    const [rows] = await pool.query(sql, params);
    
    // Format amounts as numbers
    const formattedRows = rows.map(row => ({
      ...row,
      amount: Number(row.amount) || 0,
      odometer_km: Number(row.odometer_km) || 0
    }));

    res.json(formattedRows);
  } catch (error) {
    console.error('Error in getMaintenanceLogs:', error);
    res.status(500).json({ error: error.message });
  }
};

// ✅ GET BY ID
export const getMaintenanceById = async (req, res) => {
  try {
    const { id } = req.params;

    const [rows] = await pool.query(
      `SELECT * FROM vehicle_maintenance_logs WHERE id = ?`,
      [id]
    );

    if (!rows.length) {
      return res.status(404).json({ message: "Maintenance record not found" });
    }

    res.json({
      ...rows[0],
      amount: Number(rows[0].amount) || 0,
      odometer_km: Number(rows[0].odometer_km) || 0
    });
  } catch (error) {
    console.error('Error in getMaintenanceById:', error);
    res.status(500).json({ error: error.message });
  }
};

// ✅ UPDATE
export const updateMaintenance = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      maintenance_type,
      service_date,
      km_at_service,
      cost,
      vendor_name,
      notes,
      vehicle_id
    } = req.body;

    // Check if maintenance record exists
    const [existingRows] = await pool.query(
      `SELECT * FROM vehicle_maintenance_logs WHERE id = ?`,
      [id]
    );

    if (!existingRows.length) {
      return res.status(404).json({ message: "Maintenance record not found" });
    }

    const oldCost = Number(existingRows[0].amount);
    const newCost = Number(cost);
    const costDiff = newCost - oldCost;

    const sql = `
      UPDATE vehicle_maintenance_logs
      SET 
        maintenance_type_id = ?,
        service_date = ?,
        odometer_km = ?,
        amount = ?,
        vendor_name = ?,
        notes = ?
      WHERE id = ?
    `;

    await pool.query(sql, [
      maintenance_type,
      service_date,
      km_at_service,
      cost,
      vendor_name || null,
      notes || null,
      id,
    ]);

    // Add ledger entry for adjustment if cost changed
    if (costDiff !== 0) {
      await addLedgerEntry({
        entry_type: "maintenance_adjustment",
        reference_id: id,
        reference_table: "vehicle_maintenance_logs",
        vehicle_id: vehicle_id || existingRows[0].vehicle_id,
        credit: costDiff > 0 ? costDiff : 0,
        debit: costDiff < 0 ? Math.abs(costDiff) : 0,
        description: `Maintenance record updated - amount changed from ${oldCost} to ${newCost}`
      });
    }

    res.json({ 
      message: "Maintenance updated successfully",
      old_amount: oldCost,
      new_amount: newCost
    });
  } catch (error) {
    console.error('Error in updateMaintenance:', error);
    res.status(500).json({ error: error.message });
  }
};

// ✅ DELETE
export const deleteMaintenance = async (req, res) => {
  try {
    const { id } = req.params;

    // Check if maintenance record exists
    const [existingRows] = await pool.query(
      `SELECT * FROM vehicle_maintenance_logs WHERE id = ?`,
      [id]
    );

    if (!existingRows.length) {
      return res.status(404).json({ message: "Maintenance record not found" });
    }

    const maintenance = existingRows[0];
    const vehicleId = maintenance.vehicle_id;

    // Add reversal ledger entry
    await addLedgerEntry({
      entry_type: "maintenance_deleted",
      reference_id: id,
      reference_table: "vehicle_maintenance_logs",
      vehicle_id: vehicleId,
      debit: Number(maintenance.amount),
      credit: 0,
      description: `Maintenance record deleted - Amount: ${maintenance.amount}`
    });

    // Delete the maintenance record
    await pool.query(`DELETE FROM vehicle_maintenance_logs WHERE id = ?`, [id]);

    // Check if vehicle has any other pending maintenance
    const [otherMaintenance] = await pool.query(
      `SELECT COUNT(*) as count FROM vehicle_maintenance_logs WHERE vehicle_id = ?`,
      [vehicleId]
    );

    // If no other maintenance, set vehicle status back to available
    if (otherMaintenance[0].count === 0) {
      await pool.query(`UPDATE vehicles SET status = 'available' WHERE id = ?`, [vehicleId]);
    }

    res.json({ 
      message: "Maintenance record deleted successfully",
      vehicle_id: vehicleId
    });
  } catch (error) {
    console.error('Error in deleteMaintenance:', error);
    res.status(500).json({ error: error.message });
  }
};

// ✅ COMPLETE MAINTENANCE
export const completeMaintenance = async (req, res) => {
  try {
    const { vehicle_id, maintenance_id } = req.body;

    if (!vehicle_id) {
      return res.status(400).json({ message: "vehicle_id is required" });
    }

    // Update vehicle status to available
    await pool.query(`UPDATE vehicles SET status = 'available' WHERE id = ?`, [vehicle_id]);

    // If maintenance_id provided, update that maintenance record status
    if (maintenance_id) {
      await pool.query(
        `UPDATE vehicle_maintenance_logs SET status = 'completed', completed_at = NOW() WHERE id = ?`,
        [maintenance_id]
      );
    }

    res.json({ 
      message: "Vehicle maintenance completed, vehicle is now available",
      vehicle_id: vehicle_id
    });
  } catch (error) {
    console.error('Error in completeMaintenance:', error);
    res.status(500).json({ error: error.message });
  }
};

// ✅ DUE REPORT - Maintenance schedule due
export const getDueMaintenance = async (req, res) => {
  try {
    const { days_ahead = 7 } = req.query;
    
    const sql = `
      SELECT 
        ms.*, 
        v.registration_no,
        v.car_make,
        v.car_model,
        v.odometer_km as current_odometer,
        DATEDIFF(ms.due_date, CURDATE()) as days_due
      FROM maintenance_schedule ms
      JOIN vehicles v ON ms.vehicle_id = v.id
      WHERE ms.due_date <= DATE_ADD(CURDATE(), INTERVAL ? DAY)
      AND ms.status = 'pending'
      ORDER BY ms.due_date ASC
    `;

    const [rows] = await pool.query(sql, [days_ahead]);

    const formattedRows = rows.map(row => ({
      ...row,
      days_due: Number(row.days_due),
      is_overdue: row.days_due < 0
    }));

    res.json(formattedRows);
  } catch (error) {
    console.error('Error in getDueMaintenance:', error);
    res.status(500).json({ error: error.message });
  }
};

// ✅ GET MAINTENANCE SUMMARY
export const getMaintenanceSummary = async (req, res) => {
  try {
    const { year, month } = req.query;
    const currentYear = year || new Date().getFullYear();

    let sql = `
      SELECT 
        COUNT(*) as total_maintenance,
        SUM(amount) as total_cost,
        AVG(amount) as average_cost,
        MIN(amount) as min_cost,
        MAX(amount) as max_cost,
        COUNT(DISTINCT vehicle_id) as vehicles_serviced
      FROM vehicle_maintenance_logs
      WHERE YEAR(service_date) = ?
    `;
    
    const params = [currentYear];
    
    if (month) {
      sql += ` AND MONTH(service_date) = ?`;
      params.push(month);
    }

    const [rows] = await pool.query(sql, params);

    // Get maintenance by type
    const [byType] = await pool.query(`
      SELECT 
        mt.name as maintenance_type,
        COUNT(*) as count,
        SUM(ml.amount) as total_cost
      FROM vehicle_maintenance_logs ml
      JOIN maintenance_types mt ON ml.maintenance_type_id = mt.id
      WHERE YEAR(ml.service_date) = ?
      GROUP BY ml.maintenance_type_id
      ORDER BY total_cost DESC
    `, [currentYear]);

    // Get maintenance by vehicle
    const [byVehicle] = await pool.query(`
      SELECT 
        v.registration_no,
        v.car_make,
        v.car_model,
        COUNT(ml.id) as maintenance_count,
        SUM(ml.amount) as total_cost
      FROM vehicle_maintenance_logs ml
      JOIN vehicles v ON ml.vehicle_id = v.id
      WHERE YEAR(ml.service_date) = ?
      GROUP BY ml.vehicle_id
      ORDER BY total_cost DESC
      LIMIT 10
    `, [currentYear]);

    res.json({
      year: currentYear,
      month: month || null,
      summary: {
        total_maintenance: Number(rows[0]?.total_maintenance) || 0,
        total_cost: Number(rows[0]?.total_cost) || 0,
        average_cost: Number(rows[0]?.average_cost) || 0,
        min_cost: Number(rows[0]?.min_cost) || 0,
        max_cost: Number(rows[0]?.max_cost) || 0,
        vehicles_serviced: Number(rows[0]?.vehicles_serviced) || 0
      },
      by_type: byType.map(t => ({
        maintenance_type: t.maintenance_type,
        count: Number(t.count),
        total_cost: Number(t.total_cost) || 0
      })),
      by_vehicle: byVehicle.map(v => ({
        registration_no: v.registration_no,
        car_make: v.car_make,
        car_model: v.car_model,
        maintenance_count: Number(v.maintenance_count),
        total_cost: Number(v.total_cost) || 0
      }))
    });
  } catch (error) {
    console.error('Error in getMaintenanceSummary:', error);
    res.status(500).json({ error: error.message });
  }
};

// ✅ GET MAINTENANCE COSTS BY MONTH
export const getMonthlyMaintenanceCosts = async (req, res) => {
  try {
    const { year } = req.query;
    const currentYear = year || new Date().getFullYear();

    const [rows] = await pool.query(`
      SELECT 
        MONTH(service_date) as month,
        MONTHNAME(service_date) as month_name,
        COUNT(*) as total_maintenance,
        SUM(amount) as total_cost
      FROM vehicle_maintenance_logs
      WHERE YEAR(service_date) = ?
      GROUP BY MONTH(service_date)
      ORDER BY month ASC
    `, [currentYear]);

    const monthlyData = Array(12).fill().map((_, i) => ({
      month: i + 1,
      month_name: new Date(currentYear, i, 1).toLocaleString('default', { month: 'long' }),
      total_maintenance: 0,
      total_cost: 0
    }));

    rows.forEach(row => {
      const monthIndex = row.month - 1;
      monthlyData[monthIndex].total_maintenance = Number(row.total_maintenance);
      monthlyData[monthIndex].total_cost = Number(row.total_cost) || 0;
    });

    res.json({
      year: currentYear,
      monthly_data: monthlyData,
      yearly_total: monthlyData.reduce((sum, month) => sum + month.total_cost, 0)
    });
  } catch (error) {
    console.error('Error in getMonthlyMaintenanceCosts:', error);
    res.status(500).json({ error: error.message });
  }
};