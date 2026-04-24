// backend/controllers/accessoryTypes.controller.js
import { pool } from "../../config/db.js";

// CREATE
export const createAccessoryType = async (req, res) => {
  try {
    const { name, description } = req.body;

    if (!name) {
      return res.status(400).json({ message: "Accessory type name is required" });
    }

    const [result] = await pool.query(
      "INSERT INTO vehicle_accessory_types (name, description) VALUES (?, ?)",
      [name, description || null]
    );

    res.json({ 
      message: "Accessory Type created successfully", 
      id: result.insertId 
    });
  } catch (error) {
    console.error('Error in createAccessoryType:', error);
    res.status(500).json({ error: error.message });
  }
};

// GET ALL
export const getAccessoryTypes = async (req, res) => {
  try {
    const { search = '', status } = req.query;
    
    let query = "SELECT * FROM vehicle_accessory_types WHERE 1=1";
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
    console.error('Error in getAccessoryTypes:', error);
    res.status(500).json({ error: error.message });
  }
};

// GET BY ID
export const getAccessoryTypeById = async (req, res) => {
  try {
    const { id } = req.params;

    const [rows] = await pool.query(
      "SELECT * FROM vehicle_accessory_types WHERE id = ?",
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: "Accessory Type not found" });
    }

    res.json(rows[0]);
  } catch (error) {
    console.error('Error in getAccessoryTypeById:', error);
    res.status(500).json({ error: error.message });
  }
};

// UPDATE
export const updateAccessoryType = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, status } = req.body;

    // Check if accessory type exists
    const [existing] = await pool.query(
      "SELECT id FROM vehicle_accessory_types WHERE id = ?",
      [id]
    );

    if (existing.length === 0) {
      return res.status(404).json({ message: "Accessory Type not found" });
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
      `UPDATE vehicle_accessory_types SET ${updateFields.join(", ")} WHERE id = ?`,
      updateValues
    );

    res.json({ message: "Accessory Type updated successfully" });
  } catch (error) {
    console.error('Error in updateAccessoryType:', error);
    res.status(500).json({ error: error.message });
  }
};

// DELETE
export const deleteAccessoryType = async (req, res) => {
  try {
    const { id } = req.params;

    // Check if accessory type exists
    const [existing] = await pool.query(
      "SELECT id FROM vehicle_accessory_types WHERE id = ?",
      [id]
    );

    if (existing.length === 0) {
      return res.status(404).json({ message: "Accessory Type not found" });
    }

    // Check if accessory type is being used in any handover records
    const [inUse] = await pool.query(
      "SELECT COUNT(*) as count FROM vehicle_handover_accessories WHERE accessory_type_id = ?",
      [id]
    );

    if (inUse[0]?.count > 0) {
      return res.status(400).json({ 
        message: "Cannot delete accessory type as it is being used in handover records",
        usage_count: inUse[0].count
      });
    }

    await pool.query(
      "DELETE FROM vehicle_accessory_types WHERE id = ?",
      [id]
    );

    res.json({ message: "Accessory Type deleted successfully" });
  } catch (error) {
    console.error('Error in deleteAccessoryType:', error);
    res.status(500).json({ error: error.message });
  }
};

// GET ACCESSORY TYPES SUMMARY
export const getAccessoryTypesSummary = async (req, res) => {
  try {
    const [total] = await pool.query(
      "SELECT COUNT(*) as total FROM vehicle_accessory_types"
    );
    
    const [active] = await pool.query(
      "SELECT COUNT(*) as active FROM vehicle_accessory_types WHERE status = 'active'"
    );
    
    const [inactive] = await pool.query(
      "SELECT COUNT(*) as inactive FROM vehicle_accessory_types WHERE status = 'inactive'"
    );
    
    const [usageStats] = await pool.query(`
      SELECT 
        vat.id,
        vat.name,
        COUNT(vha.id) as usage_count
      FROM vehicle_accessory_types vat
      LEFT JOIN vehicle_handover_accessories vha ON vat.id = vha.accessory_type_id
      GROUP BY vat.id
      ORDER BY usage_count DESC
      LIMIT 10
    `);

    res.json({
      summary: {
        total: total[0]?.total || 0,
        active: active[0]?.active || 0,
        inactive: inactive[0]?.inactive || 0
      },
      most_used_accessories: usageStats.map(stat => ({
        id: stat.id,
        name: stat.name,
        usage_count: Number(stat.usage_count) || 0
      }))
    });
  } catch (error) {
    console.error('Error in getAccessoryTypesSummary:', error);
    res.status(500).json({ error: error.message });
  }
};

// BULK CREATE ACCESSORY TYPES
export const bulkCreateAccessoryTypes = async (req, res) => {
  try {
    const { accessories } = req.body;

    if (!accessories || !Array.isArray(accessories) || accessories.length === 0) {
      return res.status(400).json({ message: "Accessories array is required" });
    }

    const results = [];
    const errors = [];

    for (const accessory of accessories) {
      try {
        if (!accessory.name) {
          errors.push({ accessory, error: "Name is required" });
          continue;
        }

        const [result] = await pool.query(
          "INSERT INTO vehicle_accessory_types (name, description) VALUES (?, ?)",
          [accessory.name, accessory.description || null]
        );

        results.push({
          id: result.insertId,
          name: accessory.name,
          description: accessory.description
        });
      } catch (error) {
        errors.push({ accessory, error: error.message });
      }
    }

    res.json({
      message: `Created ${results.length} accessory types`,
      success_count: results.length,
      error_count: errors.length,
      results,
      errors: errors.length > 0 ? errors : undefined
    });
  } catch (error) {
    console.error('Error in bulkCreateAccessoryTypes:', error);
    res.status(500).json({ error: error.message });
  }
};

// TOGGLE ACCESSORY TYPE STATUS
export const toggleAccessoryTypeStatus = async (req, res) => {
  try {
    const { id } = req.params;

    const [existing] = await pool.query(
      "SELECT id, status FROM vehicle_accessory_types WHERE id = ?",
      [id]
    );

    if (existing.length === 0) {
      return res.status(404).json({ message: "Accessory Type not found" });
    }

    const newStatus = existing[0].status === 'active' ? 'inactive' : 'active';

    await pool.query(
      "UPDATE vehicle_accessory_types SET status = ? WHERE id = ?",
      [newStatus, id]
    );

    res.json({ 
      message: `Accessory Type ${newStatus === 'active' ? 'activated' : 'deactivated'} successfully`,
      status: newStatus
    });
  } catch (error) {
    console.error('Error in toggleAccessoryTypeStatus:', error);
    res.status(500).json({ error: error.message });
  }
};