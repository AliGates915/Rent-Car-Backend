// backend/controllers/rentTypes.controller.js
import { pool } from "../../config/db.js";

// CREATE
export const createRentType = async (req, res) => {
  try {
    const { name, description, rate_multiplier } = req.body;

    if (!name) {
      return res.status(400).json({ message: "Rent type name is required" });
    }

    const [result] = await pool.query(
      "INSERT INTO rent_types (name, description, rate_multiplier) VALUES (?, ?, ?)",
      [name, description || null, rate_multiplier || 1.0]
    );

    res.json({ 
      message: "Rent Type created successfully", 
      id: result.insertId 
    });
  } catch (error) {
    console.error('Error in createRentType:', error);
    res.status(500).json({ error: error.message });
  }
};

// GET ALL
export const getRentTypes = async (req, res) => {
  try {
    const { search = '', status } = req.query;
    
    let query = "SELECT * FROM rent_types WHERE 1=1";
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
    console.error('Error in getRentTypes:', error);
    res.status(500).json({ error: error.message });
  }
};

// GET BY ID
export const getRentTypeById = async (req, res) => {
  try {
    const { id } = req.params;

    const [rows] = await pool.query(
      "SELECT * FROM rent_types WHERE id = ?",
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: "Rent Type not found" });
    }

    res.json(rows[0]);
  } catch (error) {
    console.error('Error in getRentTypeById:', error);
    res.status(500).json({ error: error.message });
  }
};

// UPDATE
export const updateRentType = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, rate_multiplier, status } = req.body;

    // Check if rent type exists
    const [existing] = await pool.query(
      "SELECT id FROM rent_types WHERE id = ?",
      [id]
    );

    if (existing.length === 0) {
      return res.status(404).json({ message: "Rent Type not found" });
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
    if (rate_multiplier !== undefined) {
      updateFields.push("rate_multiplier = ?");
      updateValues.push(rate_multiplier);
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
      `UPDATE rent_types SET ${updateFields.join(", ")} WHERE id = ?`,
      updateValues
    );

    res.json({ message: "Rent Type updated successfully" });
  } catch (error) {
    console.error('Error in updateRentType:', error);
    res.status(500).json({ error: error.message });
  }
};

// DELETE
export const deleteRentType = async (req, res) => {
  try {
    const { id } = req.params;

    // Check if rent type exists
    const [existing] = await pool.query(
      "SELECT id FROM rent_types WHERE id = ?",
      [id]
    );

    if (existing.length === 0) {
      return res.status(404).json({ message: "Rent Type not found" });
    }

    // Check if rent type is being used in any bookings
    const [inUse] = await pool.query(
      "SELECT COUNT(*) as count FROM bookings WHERE rent_type_id = ?",
      [id]
    );

    if (inUse[0]?.count > 0) {
      return res.status(400).json({ 
        message: "Cannot delete rent type as it is being used in bookings",
        usage_count: inUse[0].count
      });
    }

    await pool.query("DELETE FROM rent_types WHERE id = ?", [id]);

    res.json({ message: "Rent Type deleted successfully" });
  } catch (error) {
    console.error('Error in deleteRentType:', error);
    res.status(500).json({ error: error.message });
  }
};

// GET RENT TYPES SUMMARY
export const getRentTypesSummary = async (req, res) => {
  try {
    const [total] = await pool.query(
      "SELECT COUNT(*) as total FROM rent_types"
    );
    
    const [active] = await pool.query(
      "SELECT COUNT(*) as active FROM rent_types WHERE status = 'active'"
    );
    
    const [inactive] = await pool.query(
      "SELECT COUNT(*) as inactive FROM rent_types WHERE status = 'inactive'"
    );
    
    const [usageStats] = await pool.query(`
      SELECT 
        rt.id,
        rt.name,
        COUNT(b.id) as usage_count,
        SUM(b.total_amount) as total_revenue,
        AVG(b.total_amount) as avg_booking_value,
        AVG(rt.rate_multiplier) as avg_multiplier
      FROM rent_types rt
      LEFT JOIN bookings b ON rt.id = b.rent_type_id
      GROUP BY rt.id
      ORDER BY usage_count DESC
    `);

    res.json({
      summary: {
        total: total[0]?.total || 0,
        active: active[0]?.active || 0,
        inactive: inactive[0]?.inactive || 0
      },
      rent_type_stats: usageStats.map(stat => ({
        id: stat.id,
        name: stat.name,
        usage_count: Number(stat.usage_count) || 0,
        total_revenue: Number(stat.total_revenue) || 0,
        average_booking_value: Number(stat.avg_booking_value) || 0,
        average_multiplier: Number(stat.avg_multiplier) || 0
      }))
    });
  } catch (error) {
    console.error('Error in getRentTypesSummary:', error);
    res.status(500).json({ error: error.message });
  }
};

// BULK CREATE RENT TYPES
export const bulkCreateRentTypes = async (req, res) => {
  try {
    const { rent_types } = req.body;

    if (!rent_types || !Array.isArray(rent_types) || rent_types.length === 0) {
      return res.status(400).json({ message: "Rent types array is required" });
    }

    const results = [];
    const errors = [];

    for (const type of rent_types) {
      try {
        if (!type.name) {
          errors.push({ type, error: "Name is required" });
          continue;
        }

        const [result] = await pool.query(
          "INSERT INTO rent_types (name, description, rate_multiplier) VALUES (?, ?, ?)",
          [type.name, type.description || null, type.rate_multiplier || 1.0]
        );

        results.push({
          id: result.insertId,
          name: type.name,
          description: type.description,
          rate_multiplier: type.rate_multiplier || 1.0
        });
      } catch (error) {
        errors.push({ type, error: error.message });
      }
    }

    res.json({
      message: `Created ${results.length} rent types`,
      success_count: results.length,
      error_count: errors.length,
      results,
      errors: errors.length > 0 ? errors : undefined
    });
  } catch (error) {
    console.error('Error in bulkCreateRentTypes:', error);
    res.status(500).json({ error: error.message });
  }
};

// TOGGLE RENT TYPE STATUS
export const toggleRentTypeStatus = async (req, res) => {
  try {
    const { id } = req.params;

    const [existing] = await pool.query(
      "SELECT id, status FROM rent_types WHERE id = ?",
      [id]
    );

    if (existing.length === 0) {
      return res.status(404).json({ message: "Rent Type not found" });
    }

    const newStatus = existing[0].status === 'active' ? 'inactive' : 'active';

    await pool.query(
      "UPDATE rent_types SET status = ? WHERE id = ?",
      [newStatus, id]
    );

    res.json({ 
      message: `Rent Type ${newStatus === 'active' ? 'activated' : 'deactivated'} successfully`,
      status: newStatus
    });
  } catch (error) {
    console.error('Error in toggleRentTypeStatus:', error);
    res.status(500).json({ error: error.message });
  }
};

// GET ACTIVE RENT TYPES WITH MULTIPLIERS
export const getActiveRentTypes = async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT 
        id,
        name,
        description,
        rate_multiplier,
        status
      FROM rent_types
      WHERE status = 'active'
      ORDER BY rate_multiplier ASC, name ASC
    `);

    res.json(rows);
  } catch (error) {
    console.error('Error in getActiveRentTypes:', error);
    res.status(500).json({ error: error.message });
  }
};

// GET RENT TYPE BY NAME (for validation)
export const getRentTypeByName = async (req, res) => {
  try {
    const { name } = req.params;

    const [rows] = await pool.query(
      "SELECT * FROM rent_types WHERE name = ?",
      [name]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: "Rent Type not found" });
    }

    res.json(rows[0]);
  } catch (error) {
    console.error('Error in getRentTypeByName:', error);
    res.status(500).json({ error: error.message });
  }
};