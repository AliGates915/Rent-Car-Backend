// backend/controllers/maintenanceTypes.controller.js
import { pool } from "../../config/db.js";

// CREATE
export const createMaintenanceType = async (req, res) => {
  try {
    const { name, description, default_km_interval, default_days_interval } = req.body;

    if (!name) {
      return res.status(400).json({ message: "Maintenance type name is required" });
    }

    const sql = `
      INSERT INTO vehicle_maintenance_types 
      (name, description, default_km_interval, default_days_interval)
      VALUES (?, ?, ?, ?)
    `;

    const [result] = await pool.query(sql, [
      name,
      description || null,
      default_km_interval || null,
      default_days_interval || null
    ]);

    res.json({ 
      message: "Maintenance Type created successfully", 
      id: result.insertId 
    });
  } catch (error) {
    console.error('Error in createMaintenanceType:', error);
    res.status(500).json({ error: error.message });
  }
};

// GET ALL
export const getMaintenanceTypes = async (req, res) => {
  try {
    const { search = '', status } = req.query;
    
    let query = "SELECT * FROM vehicle_maintenance_types WHERE 1=1";
    const params = [];
    
    if (search) {
      query += " AND (name LIKE ? OR description LIKE ?)";
      params.push(`%${search}%`, `%${search}%`);
    }
    
    if (status) {
      query += " AND status = ?";
      params.push(status);
    }
    
    query += " ORDER BY name ASC";
    
    const [rows] = await pool.query(query, params);
    res.json(rows);
  } catch (error) {
    console.error('Error in getMaintenanceTypes:', error);
    res.status(500).json({ error: error.message });
  }
};

// GET BY ID
export const getMaintenanceTypeById = async (req, res) => {
  try {
    const { id } = req.params;

    const [rows] = await pool.query(
      "SELECT * FROM vehicle_maintenance_types WHERE id = ?",
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: "Maintenance Type not found" });
    }

    res.json(rows[0]);
  } catch (error) {
    console.error('Error in getMaintenanceTypeById:', error);
    res.status(500).json({ error: error.message });
  }
};

// UPDATE
export const updateMaintenanceType = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, default_km_interval, default_days_interval, status } = req.body;

    // Check if maintenance type exists
    const [existing] = await pool.query(
      "SELECT id FROM vehicle_maintenance_types WHERE id = ?",
      [id]
    );

    if (existing.length === 0) {
      return res.status(404).json({ message: "Maintenance Type not found" });
    }

    // Build dynamic update query
    let updateFields = [];
    let updateValues = [];

    if (name !== undefined) {
      updateFields.push("name = ?");
      updateValues.push(name);
    }
    if (description !== undefined) {
      updateFields.push("description = ?");
      updateValues.push(description || null);
    }
    if (default_km_interval !== undefined) {
      updateFields.push("default_km_interval = ?");
      updateValues.push(default_km_interval || null);
    }
    if (default_days_interval !== undefined) {
      updateFields.push("default_days_interval = ?");
      updateValues.push(default_days_interval || null);
    }
    if (status !== undefined) {
      updateFields.push("status = ?");
      updateValues.push(status);
    }

    if (updateFields.length === 0) {
      return res.status(400).json({ message: "No fields to update" });
    }

    updateValues.push(id);

    await pool.query(
      `UPDATE vehicle_maintenance_types SET ${updateFields.join(", ")} WHERE id = ?`,
      updateValues
    );

    res.json({ message: "Maintenance Type updated successfully" });
  } catch (error) {
    console.error('Error in updateMaintenanceType:', error);
    res.status(500).json({ error: error.message });
  }
};

// DELETE
export const deleteMaintenanceType = async (req, res) => {
  try {
    const { id } = req.params;

    // Check if maintenance type exists
    const [existing] = await pool.query(
      "SELECT id FROM vehicle_maintenance_types WHERE id = ?",
      [id]
    );

    if (existing.length === 0) {
      return res.status(404).json({ message: "Maintenance Type not found" });
    }

    // Check if maintenance type is being used in any maintenance logs
    const [inUse] = await pool.query(
      "SELECT COUNT(*) as count FROM vehicle_maintenance_logs WHERE maintenance_type_id = ?",
      [id]
    );

    if (inUse[0]?.count > 0) {
      return res.status(400).json({ 
        message: "Cannot delete maintenance type as it is being used in maintenance records",
        usage_count: inUse[0].count
      });
    }

    await pool.query(
      "DELETE FROM vehicle_maintenance_types WHERE id = ?",
      [id]
    );

    res.json({ message: "Maintenance Type deleted successfully" });
  } catch (error) {
    console.error('Error in deleteMaintenanceType:', error);
    res.status(500).json({ error: error.message });
  }
};

// GET MAINTENANCE TYPES SUMMARY
export const getMaintenanceTypesSummary = async (req, res) => {
  try {
    const [total] = await pool.query(
      "SELECT COUNT(*) as total FROM vehicle_maintenance_types"
    );
    
    const [active] = await pool.query(
      "SELECT COUNT(*) as active FROM vehicle_maintenance_types WHERE status = 'active'"
    );
    
    const [inactive] = await pool.query(
      "SELECT COUNT(*) as inactive FROM vehicle_maintenance_types WHERE status = 'inactive'"
    );
    
    const [usageStats] = await pool.query(`
      SELECT 
        vmt.id,
        vmt.name,
        COUNT(vml.id) as usage_count,
        SUM(vml.amount) as total_cost,
        AVG(vml.amount) as avg_cost
      FROM vehicle_maintenance_types vmt
      LEFT JOIN vehicle_maintenance_logs vml ON vmt.id = vml.maintenance_type_id
      GROUP BY vmt.id
      ORDER BY usage_count DESC
    `);

    res.json({
      summary: {
        total: total[0]?.total || 0,
        active: active[0]?.active || 0,
        inactive: inactive[0]?.inactive || 0
      },
      maintenance_stats: usageStats.map(stat => ({
        id: stat.id,
        name: stat.name,
        usage_count: Number(stat.usage_count) || 0,
        total_cost: Number(stat.total_cost) || 0,
        average_cost: Number(stat.avg_cost) || 0
      }))
    });
  } catch (error) {
    console.error('Error in getMaintenanceTypesSummary:', error);
    res.status(500).json({ error: error.message });
  }
};

// BULK CREATE MAINTENANCE TYPES
export const bulkCreateMaintenanceTypes = async (req, res) => {
  try {
    const { maintenance_types } = req.body;

    if (!maintenance_types || !Array.isArray(maintenance_types) || maintenance_types.length === 0) {
      return res.status(400).json({ message: "Maintenance types array is required" });
    }

    const results = [];
    const errors = [];

    for (const type of maintenance_types) {
      try {
        if (!type.name) {
          errors.push({ type, error: "Name is required" });
          continue;
        }

        const [result] = await pool.query(
          `INSERT INTO vehicle_maintenance_types 
           (name, description, default_km_interval, default_days_interval) 
           VALUES (?, ?, ?, ?)`,
          [
            type.name,
            type.description || null,
            type.default_km_interval || null,
            type.default_days_interval || null
          ]
        );

        results.push({
          id: result.insertId,
          name: type.name,
          description: type.description
        });
      } catch (error) {
        errors.push({ type, error: error.message });
      }
    }

    res.json({
      message: `Created ${results.length} maintenance types`,
      success_count: results.length,
      error_count: errors.length,
      results,
      errors: errors.length > 0 ? errors : undefined
    });
  } catch (error) {
    console.error('Error in bulkCreateMaintenanceTypes:', error);
    res.status(500).json({ error: error.message });
  }
};

// TOGGLE MAINTENANCE TYPE STATUS
export const toggleMaintenanceTypeStatus = async (req, res) => {
  try {
    const { id } = req.params;

    const [existing] = await pool.query(
      "SELECT id, status FROM vehicle_maintenance_types WHERE id = ?",
      [id]
    );

    if (existing.length === 0) {
      return res.status(404).json({ message: "Maintenance Type not found" });
    }

    const newStatus = existing[0].status === 'active' ? 'inactive' : 'active';

    await pool.query(
      "UPDATE vehicle_maintenance_types SET status = ? WHERE id = ?",
      [newStatus, id]
    );

    res.json({ 
      message: `Maintenance Type ${newStatus === 'active' ? 'activated' : 'deactivated'} successfully`,
      status: newStatus
    });
  } catch (error) {
    console.error('Error in toggleMaintenanceTypeStatus:', error);
    res.status(500).json({ error: error.message });
  }
};

// GET MAINTENANCE TYPES WITH DEFAULT INTERVALS
export const getMaintenanceTypesWithIntervals = async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT 
        id,
        name,
        description,
        default_km_interval,
        default_days_interval,
        status
      FROM vehicle_maintenance_types
      WHERE status = 'active'
      AND (default_km_interval IS NOT NULL OR default_days_interval IS NOT NULL)
      ORDER BY default_days_interval ASC, default_km_interval ASC
    `);

    res.json(rows);
  } catch (error) {
    console.error('Error in getMaintenanceTypesWithIntervals:', error);
    res.status(500).json({ error: error.message });
  }
};