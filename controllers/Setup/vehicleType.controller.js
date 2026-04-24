// backend/controllers/vehicleTypes.controller.js
import { pool } from "../../config/db.js";

// CREATE
export const createVehicleType = async (req, res) => {
  try {
    const { name, description } = req.body;

    if (!name) {
      return res.status(400).json({ message: "Vehicle type name is required" });
    }

    const sql = `INSERT INTO vehicle_types (name, description) VALUES (?, ?)`;

    const [result] = await pool.query(sql, [name, description || null]);

    res.json({ 
      message: "Vehicle Type created successfully", 
      id: result.insertId 
    });
  } catch (error) {
    console.error('Error in createVehicleType:', error);
    res.status(500).json({ error: error.message });
  }
};

// GET ALL
export const getVehicleTypes = async (req, res) => {
  try {
    const { page = 1, limit = 10, search = '', status = '' } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    
    let query = "SELECT * FROM vehicle_types WHERE 1=1";
    const params = [];
    
    // Add search condition
    if (search) {
      query += " AND (name LIKE ? OR description LIKE ?)";
      params.push(`%${search}%`, `%${search}%`);
    }
    
    // Add status filter
    if (status) {
      query += " AND status = ?";
      params.push(status);
    }
    
    // Get total count
    const countQuery = query.replace('SELECT *', 'SELECT COUNT(*) as total');
    const [countResult] = await pool.query(countQuery, params);
    const total = countResult[0]?.total || 0;
    
    // Get paginated results
    query += " ORDER BY created_at DESC LIMIT ? OFFSET ?";
    const [rows] = await pool.query(query, [...params, parseInt(limit), parseInt(offset)]);
    
    res.json({
      success: true,
      data: rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Error in getVehicleTypes:', error);
    res.status(500).json({ error: error.message });
  }
};

// GET ALL VEHICLE TYPES (NO PAGINATION - FOR DROPDOWNS)
export const getAllVehicleTypes = async (req, res) => {
  try {
    const { status = 'active' } = req.query;
    
    let query = "SELECT id, name, description FROM vehicle_types WHERE 1=1";
    const params = [];
    
    if (status) {
      query += " AND status = ?";
      params.push(status);
    }
    
    query += " ORDER BY name ASC";
    
    const [rows] = await pool.query(query, params);
    res.json(rows);
  } catch (error) {
    console.error('Error in getAllVehicleTypes:', error);
    res.status(500).json({ error: error.message });
  }
};

// GET BY ID
export const getVehicleTypeById = async (req, res) => {
  try {
    const { id } = req.params;

    const [rows] = await pool.query(
      "SELECT * FROM vehicle_types WHERE id = ?",
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: "Vehicle Type not found" });
    }

    res.json(rows[0]);
  } catch (error) {
    console.error('Error in getVehicleTypeById:', error);
    res.status(500).json({ error: error.message });
  }
};

// UPDATE
export const updateVehicleType = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, status } = req.body;

    // Check if vehicle type exists
    const [existing] = await pool.query(
      "SELECT id FROM vehicle_types WHERE id = ?",
      [id]
    );

    if (existing.length === 0) {
      return res.status(404).json({ message: "Vehicle Type not found" });
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
    if (status !== undefined) {
      updateFields.push("status = ?");
      updateValues.push(status);
    }

    if (updateFields.length === 0) {
      return res.status(400).json({ message: "No fields to update" });
    }

    updateValues.push(id);

    await pool.query(
      `UPDATE vehicle_types SET ${updateFields.join(", ")} WHERE id = ?`,
      updateValues
    );

    res.json({ message: "Vehicle Type updated successfully" });
  } catch (error) {
    console.error('Error in updateVehicleType:', error);
    res.status(500).json({ error: error.message });
  }
};

// DELETE
export const deleteVehicleType = async (req, res) => {
  try {
    const { id } = req.params;

    // Check if vehicle type exists
    const [existing] = await pool.query(
      "SELECT id FROM vehicle_types WHERE id = ?",
      [id]
    );

    if (existing.length === 0) {
      return res.status(404).json({ message: "Vehicle Type not found" });
    }

    // Check if vehicle type is being used in any vehicles
    const [inUse] = await pool.query(
      "SELECT COUNT(*) as count FROM vehicles WHERE vehicle_type_id = ?",
      [id]
    );

    if (inUse[0]?.count > 0) {
      return res.status(400).json({ 
        message: "Cannot delete vehicle type as it is being used by vehicles",
        usage_count: inUse[0].count
      });
    }

    await pool.query("DELETE FROM vehicle_types WHERE id = ?", [id]);

    res.json({ message: "Vehicle Type deleted successfully" });
  } catch (error) {
    console.error('Error in deleteVehicleType:', error);
    res.status(500).json({ error: error.message });
  }
};

// GET VEHICLE TYPES SUMMARY
export const getVehicleTypesSummary = async (req, res) => {
  try {
    const [total] = await pool.query(
      "SELECT COUNT(*) as total FROM vehicle_types"
    );
    
    const [active] = await pool.query(
      "SELECT COUNT(*) as active FROM vehicle_types WHERE status = 'active'"
    );
    
    const [inactive] = await pool.query(
      "SELECT COUNT(*) as inactive FROM vehicle_types WHERE status = 'inactive'"
    );
    
    const [vehicleTypeStats] = await pool.query(`
      SELECT 
        vt.id,
        vt.name,
        COUNT(v.id) as vehicle_count,
        COUNT(DISTINCT b.id) as booking_count,
        SUM(b.total_amount) as total_revenue,
        AVG(v.rate_per_day) as avg_rate_per_day
      FROM vehicle_types vt
      LEFT JOIN vehicles v ON vt.id = v.vehicle_type_id
      LEFT JOIN bookings b ON v.id = b.vehicle_id AND b.status = 'completed'
      GROUP BY vt.id
      ORDER BY vehicle_count DESC
    `);

    res.json({
      summary: {
        total: total[0]?.total || 0,
        active: active[0]?.active || 0,
        inactive: inactive[0]?.inactive || 0
      },
      vehicle_type_stats: vehicleTypeStats.map(stat => ({
        id: stat.id,
        name: stat.name,
        vehicle_count: Number(stat.vehicle_count) || 0,
        booking_count: Number(stat.booking_count) || 0,
        total_revenue: Number(stat.total_revenue) || 0,
        average_rate_per_day: Number(stat.avg_rate_per_day) || 0
      }))
    });
  } catch (error) {
    console.error('Error in getVehicleTypesSummary:', error);
    res.status(500).json({ error: error.message });
  }
};

// BULK CREATE VEHICLE TYPES
export const bulkCreateVehicleTypes = async (req, res) => {
  try {
    const { vehicle_types } = req.body;

    if (!vehicle_types || !Array.isArray(vehicle_types) || vehicle_types.length === 0) {
      return res.status(400).json({ message: "Vehicle types array is required" });
    }

    const results = [];
    const errors = [];

    for (const type of vehicle_types) {
      try {
        if (!type.name) {
          errors.push({ type, error: "Name is required" });
          continue;
        }

        const [result] = await pool.query(
          "INSERT INTO vehicle_types (name, description) VALUES (?, ?)",
          [type.name, type.description || null]
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
      message: `Created ${results.length} vehicle types`,
      success_count: results.length,
      error_count: errors.length,
      results,
      errors: errors.length > 0 ? errors : undefined
    });
  } catch (error) {
    console.error('Error in bulkCreateVehicleTypes:', error);
    res.status(500).json({ error: error.message });
  }
};

// TOGGLE VEHICLE TYPE STATUS
export const toggleVehicleTypeStatus = async (req, res) => {
  try {
    const { id } = req.params;

    const [existing] = await pool.query(
      "SELECT id, status FROM vehicle_types WHERE id = ?",
      [id]
    );

    if (existing.length === 0) {
      return res.status(404).json({ message: "Vehicle Type not found" });
    }

    const newStatus = existing[0].status === 'active' ? 'inactive' : 'active';

    await pool.query(
      "UPDATE vehicle_types SET status = ? WHERE id = ?",
      [newStatus, id]
    );

    res.json({ 
      message: `Vehicle Type ${newStatus === 'active' ? 'activated' : 'deactivated'} successfully`,
      status: newStatus
    });
  } catch (error) {
    console.error('Error in toggleVehicleTypeStatus:', error);
    res.status(500).json({ error: error.message });
  }
};

// GET VEHICLE TYPE STATISTICS
export const getVehicleTypeStatistics = async (req, res) => {
  try {
    const [stats] = await pool.query(`
      SELECT 
        vt.name as vehicle_type,
        COUNT(DISTINCT v.id) as total_vehicles,
        COUNT(DISTINCT b.id) as total_bookings,
        SUM(CASE WHEN b.status = 'ongoing' THEN 1 ELSE 0 END) as active_bookings,
        SUM(CASE WHEN b.status = 'completed' THEN 1 ELSE 0 END) as completed_bookings,
        SUM(CASE WHEN b.status = 'cancelled' THEN 1 ELSE 0 END) as cancelled_bookings,
        SUM(b.total_amount) as total_revenue,
        AVG(b.total_amount) as average_booking_value,
        AVG(v.rate_per_day) as average_daily_rate
      FROM vehicle_types vt
      LEFT JOIN vehicles v ON vt.id = v.vehicle_type_id
      LEFT JOIN bookings b ON v.id = b.vehicle_id
      GROUP BY vt.id, vt.name
      ORDER BY total_revenue DESC
    `);

    res.json(stats.map(stat => ({
      vehicle_type: stat.vehicle_type,
      total_vehicles: Number(stat.total_vehicles) || 0,
      total_bookings: Number(stat.total_bookings) || 0,
      active_bookings: Number(stat.active_bookings) || 0,
      completed_bookings: Number(stat.completed_bookings) || 0,
      cancelled_bookings: Number(stat.cancelled_bookings) || 0,
      total_revenue: Number(stat.total_revenue) || 0,
      average_booking_value: Number(stat.average_booking_value) || 0,
      average_daily_rate: Number(stat.average_daily_rate) || 0
    })));
  } catch (error) {
    console.error('Error in getVehicleTypeStatistics:', error);
    res.status(500).json({ error: error.message });
  }
};