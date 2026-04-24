// backend/controllers/customerReferenceController.js
import { pool } from "../../config/db.js";

export const addCustomerReference = async (req, res) => {
  try {
    const { customer_id } = req.params;

    const {
      reference_name,
      reference_father,
      reference_phone_no,
      reference_cnic,
      reference_address,
      relation_with_customer,
    } = req.body;

    if (!reference_name) {
      return res.status(400).json({ message: "Reference name required" });
    }

    const sql = `
      INSERT INTO customer_references
      (customer_id, reference_name, reference_father, reference_phone_no,
       reference_cnic, reference_address, relation_with_customer)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `;

    const [result] = await pool.query(sql, [
      customer_id,
      reference_name,
      reference_father || null,
      reference_phone_no || null,
      reference_cnic || null,
      reference_address || null,
      relation_with_customer || null,
    ]);

    res.json({ 
      message: "Reference added", 
      reference_id: result.insertId 
    });
  } catch (error) {
    console.error('Error in addCustomerReference:', error);
    res.status(500).json({ error: error.message });
  }
};

export const getCustomerReferences = async (req, res) => {
  try {
    const { customer_id } = req.params;

    const sql = `
      SELECT * FROM customer_references
      WHERE customer_id = ?
      ORDER BY id DESC
    `;

    const [rows] = await pool.query(sql, [customer_id]);

    res.json(rows);
  } catch (error) {
    console.error('Error in getCustomerReferences:', error);
    res.status(500).json({ error: error.message });
  }
};

export const deleteCustomerReference = async (req, res) => {
  try {
    const { reference_id } = req.params;

    const sql = `
      DELETE FROM customer_references
      WHERE id = ?
    `;

    await pool.query(sql, [reference_id]);

    res.json({ message: "Reference deleted successfully" });
  } catch (error) {
    console.error('Error in deleteCustomerReference:', error);
    res.status(500).json({ error: error.message });
  }
};

export const updateCustomerReference = async (req, res) => {
  try {
    const { reference_id } = req.params;

    const {
      reference_name,
      reference_father,
      reference_phone_no,
      reference_cnic,
      reference_address,
      relation_with_customer,
    } = req.body;

    if (!reference_name) {
      return res.status(400).json({ message: "Reference name required" });
    }

    const sql = `
      UPDATE customer_references
      SET reference_name = ?,
          reference_father = ?,
          reference_phone_no = ?,
          reference_cnic = ?,
          reference_address = ?,
          relation_with_customer = ?
      WHERE id = ?
    `;

    await pool.query(sql, [
      reference_name,
      reference_father || null,
      reference_phone_no || null,
      reference_cnic || null,
      reference_address || null,
      relation_with_customer || null,
      reference_id,
    ]);

    res.json({ message: "Reference updated successfully" });
  } catch (error) {
    console.error('Error in updateCustomerReference:', error);
    res.status(500).json({ error: error.message });
  }
};

// Optional: Get a single reference by ID
export const getCustomerReferenceById = async (req, res) => {
  try {
    const { reference_id } = req.params;

    const sql = `
      SELECT * FROM customer_references
      WHERE id = ?
    `;

    const [rows] = await pool.query(sql, [reference_id]);

    if (!rows.length) {
      return res.status(404).json({ message: "Reference not found" });
    }

    res.json(rows[0]);
  } catch (error) {
    console.error('Error in getCustomerReferenceById:', error);
    res.status(500).json({ error: error.message });
  }
};

// Optional: Get all references with customer details
export const getAllReferencesWithCustomers = async (req, res) => {
  try {
    const { search } = req.query;

    let sql = `
      SELECT 
        cr.*,
        c.customer_name,
        c.phone_no as customer_phone,
        c.cnic_no as customer_cnic
      FROM customer_references cr
      JOIN customers c ON cr.customer_id = c.id
      WHERE 1=1
    `;

    const params = [];

    if (search) {
      sql += ` AND (
        cr.reference_name LIKE ? OR 
        cr.reference_phone_no LIKE ? OR 
        c.customer_name LIKE ?
      )`;
      const searchPattern = `%${search}%`;
      params.push(searchPattern, searchPattern, searchPattern);
    }

    sql += ` ORDER BY cr.id DESC`;

    const [rows] = await pool.query(sql, params);
    res.json(rows);
  } catch (error) {
    console.error('Error in getAllReferencesWithCustomers:', error);
    res.status(500).json({ error: error.message });
  }
};

// Optional: Get references count by customer
export const getCustomerReferenceStats = async (req, res) => {
  try {
    const { customer_id } = req.params;

    const sql = `
      SELECT 
        COUNT(*) as total_references,
        COUNT(DISTINCT reference_phone_no) as unique_phone_numbers,
        COUNT(DISTINCT reference_cnic) as unique_cnic_numbers
      FROM customer_references
      WHERE customer_id = ?
    `;

    const [rows] = await pool.query(sql, [customer_id]);

    res.json(rows[0]);
  } catch (error) {
    console.error('Error in getCustomerReferenceStats:', error);
    res.status(500).json({ error: error.message });
  }
};