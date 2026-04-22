import { pool } from "../../config/db.js";
import { cloudinary } from "../../config/cloudinary.js";
import { validateDocument, validateFile } from "../../utils/ocrValidator.js";

// ====================== CREATE CUSTOMER ======================
export const createCustomer = async (req, res) => {
  const {
    customer_name,
    father_name,
    cnic_no,
    address,
    phone_no,
    alternate_phone,
    driving_license_no,
    profession,
    profession_address,
    notes,
  } = req.body;

  if (!customer_name || !phone_no) {
    return res.status(400).json({ message: "Name & phone required" });
  }

  const sql = `
    INSERT INTO customers 
    (customer_name, father_name, cnic_no, address, phone_no, alternate_phone,
     driving_license_no, profession, profession_address, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

  try {
    const [result] = await pool.query(sql, [
      customer_name,
      father_name || null,
      cnic_no || null,
      address || null,
      phone_no,
      alternate_phone || null,
      driving_license_no || null,
      profession || null,
      profession_address || null,
      notes || null,
    ]);

    res.json({
      message: "Customer created",
      customer_id: result.insertId,
    });
  } catch (err) {
    res.status(500).json(err);
  }
};

export const getCustomers = async (req, res) => {
  const { search = "", status = "", page = 1, limit = 10 } = req.query;

  let sql = `SELECT * FROM customers WHERE 1=1`;
  let countSql = `SELECT COUNT(*) as total FROM customers WHERE 1=1`;

  const params = [];

  // 🔍 SEARCH
  if (search) {
    sql += ` AND customer_name LIKE ?`;
    countSql += ` AND customer_name LIKE ?`;
    params.push(`%${search}%`);
  }

  // 🎯 STATUS
  if (status) {
    sql += ` AND status = ?`;
    countSql += ` AND status = ?`;
    params.push(status);
  }

  // 📄 PAGINATION
  const offset = (page - 1) * limit;
  sql += ` LIMIT ? OFFSET ?`;

  try {
    const [countResult] = await pool.query(countSql, params);
    const total = countResult[0].total;

    const [rows] = await pool.query(sql, [...params, Number(limit), Number(offset)]);

    res.json({
      data: rows,
      meta: {
        total,
        page: Number(page),
        limit: Number(limit),
      },
    });
  } catch (err) {
    res.status(500).json(err);
  }
};

export const getCustomerById = async (req, res) => {
  const { id } = req.params;

  const customerSql = `SELECT * FROM customers WHERE id=?`;
  const docSql = `SELECT * FROM customer_documents WHERE customer_id=?`;
  const refSql = `SELECT * FROM customer_references WHERE customer_id=?`;

  try {
    const [customer] = await pool.query(customerSql, [id]);
    if (customer.length === 0) {
      return res.status(404).json({ message: "Customer not found" });
    }

    const [docs] = await pool.query(docSql, [id]);
    const [refs] = await pool.query(refSql, [id]);

    res.json({
      ...customer[0],
      documents: docs,
      references: refs,
    });
  } catch (err) {
    res.status(500).json(err);
  }
};

export const updateCustomer = async (req, res) => {
  const { id } = req.params;

  const {
    customer_name,
    father_name,
    cnic_no,
    address,
    phone_no,
    alternate_phone,
    driving_license_no,
    profession,
    profession_address,
    status,
    notes,
  } = req.body;

  const sql = `
    UPDATE customers SET
      customer_name=?,
      father_name=?,
      cnic_no=?,
      address=?,
      phone_no=?,
      alternate_phone=?,
      driving_license_no=?,
      profession=?,
      profession_address=?,
      status=?,
      notes=?
    WHERE id=?
  `;

  try {
    await pool.query(sql, [
      customer_name,
      father_name,
      cnic_no,
      address,
      phone_no,
      alternate_phone,
      driving_license_no,
      profession,
      profession_address,
      status,
      notes,
      id,
    ]);

    res.json({ message: "Customer updated" });
  } catch (err) {
    res.status(500).json(err);
  }
};

export const deleteCustomer = async (req, res) => {
  const { id } = req.params;

  try {
    await pool.query("DELETE FROM customers WHERE id=?", [id]);
    res.json({ message: "Customer deleted" });
  } catch (err) {
    res.status(500).json(err);
  }
};

// controllers/Customer/customer.controller.js

export const uploadCustomerDocument = async (req, res) => {
  try {
    const { customer_id } = req.params;
    const { document_type } = req.body;

    const file = req.file;

    if (!file) {
      return res.status(400).json({ message: "File required" });
    }

    // 🔥 FILE VALIDATION
    const fileError = validateFile(file);
    if (fileError) {
      return res.status(400).json({ message: fileError });
    }

    const fileUrl = file.secure_url || file.url;

    // Use file.path (Cloudinary URL) for OCR validation
    const validationResult = await validateDocument(fileUrl, document_type);
    
    let rejectionReason = null;
    let isValid = false;

    if (validationResult.isValid) {
      isValid = true;
    } else {
      isValid = false;
      rejectionReason = validationResult.reason || "OCR validation failed - document text doesn't match requirements";
    }

    // Check existing document
    const checkSql = `
      SELECT * FROM customer_documents
      WHERE customer_id = ? AND document_type = ?
      LIMIT 1
    `;

    try {
      const [result] = await pool.query(checkSql, [customer_id, document_type]);

      if (result.length > 0) {
        const oldDoc = result[0];

        if (oldDoc.public_id) {
          await cloudinary.uploader.destroy(oldDoc.public_id);
        }

        const updateSql = `
          UPDATE customer_documents
          SET file_url = ?, 
              public_id = ?, 
              is_verified = ?,
              rejection_reason = ?,
              updated_at = NOW()
          WHERE id = ?
        `;

        await pool.query(updateSql, [
          fileUrl,
          file.filename,
          isValid ? 1 : 0,
          rejectionReason,
          oldDoc.id,
        ]);

        res.json({
          message: isValid
            ? "Document updated & verified"
            : "Document updated but rejected",
          verified: isValid,
          rejectionReason: rejectionReason,
          extractedText: validationResult.extractedText
        });
      } else {
        const insertSql = `
          INSERT INTO customer_documents
          (customer_id, document_type, file_url, public_id, is_verified, rejection_reason)
          VALUES (?, ?, ?, ?, ?, ?)
        `;

        await pool.query(insertSql, [
          customer_id,
          document_type,
          fileUrl,
          file.filename,
          isValid ? 1 : 0,
          rejectionReason,
        ]);

        res.json({
          message: isValid
            ? "Document uploaded & verified"
            : "Document uploaded but rejected",
          verified: isValid,
          rejectionReason: rejectionReason,
          extractedText: validationResult.extractedText
        });
      }
    } catch (dbError) {
      res.status(500).json(dbError);
    }
  } catch (error) {
    console.error("Upload error:", error);
    res.status(500).json({ message: error.message });
  }
};

export const getCustomerDocuments = async (req, res) => {
  const { customer_id } = req.params;

  const sql = `
    SELECT * FROM customer_documents
    WHERE customer_id = ?
    ORDER BY id DESC
  `;

  try {
    const [rows] = await pool.query(sql, [customer_id]);
    res.json(rows);
  } catch (err) {
    res.status(500).json(err);
  }
};