import { db } from "../../config/db.js";
import { cloudinary } from "../../config/cloudinary.js";


// ====================== CREATE CUSTOMER ======================
export const createCustomer = (req, res) => {
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

  db.query(
    sql,
    [
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
    ],
    (err, result) => {
      if (err) return res.status(500).json(err);

      res.json({
        message: "Customer created",
        customer_id: result.insertId,
      });
    }
  );
};

export const getCustomers = (req, res) => {
  const sql = `SELECT * FROM customers ORDER BY id DESC`;

  db.query(sql, (err, rows) => {
    if (err) return res.status(500).json(err);

    res.json(rows);
  });
};


export const getCustomerById = (req, res) => {
  const { id } = req.params;

  const customerSql = `SELECT * FROM customers WHERE id=?`;
  const docSql = `SELECT * FROM customer_documents WHERE customer_id=?`;
  const refSql = `SELECT * FROM customer_references WHERE customer_id=?`;

  db.query(customerSql, [id], (err, customer) => {
    if (err) return res.status(500).json(err);
    if (customer.length === 0)
      return res.status(404).json({ message: "Customer not found" });

    db.query(docSql, [id], (err, docs) => {
      if (err) return res.status(500).json(err);

      db.query(refSql, [id], (err, refs) => {
        if (err) return res.status(500).json(err);

        res.json({
          ...customer[0],
          documents: docs,
          references: refs,
        });
      });
    });
  });
};


export const updateCustomer = (req, res) => {
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

  db.query(
    sql,
    [
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
    ],
    (err) => {
      if (err) return res.status(500).json(err);

      res.json({ message: "Customer updated" });
    }
  );
};


export const uploadCustomerDocument = async (req, res) => {
  try {
    const { customer_id } = req.params;
    const { document_type } = req.body;
    const file = req.files?.[0];

    if (!file) {
      return res.status(400).json({ message: "File required" });
    }

    // 🔍 Step 1: check existing document
    const checkSql = `
      SELECT * FROM customer_documents
      WHERE customer_id = ? AND document_type = ?
      LIMIT 1
    `;

    db.query(checkSql, [customer_id, document_type], async (err, result) => {
      if (err) return res.status(500).json(err);

      // ✅ IF EXISTS → UPDATE FLOW
      if (result.length > 0) {
        const oldDoc = result[0];

        // 🗑 Step 2: delete from Cloudinary
        if (oldDoc.public_id) {
          await cloudinary.uploader.destroy(oldDoc.public_id);
        }

        // 🔄 Step 3: update DB
        const updateSql = `
          UPDATE customer_documents
          SET file_url = ?, public_id = ?, updated_at = NOW()
          WHERE id = ?
        `;

        db.query(
          updateSql,
          [file.path, file.filename, oldDoc.id],
          (err) => {
            if (err) return res.status(500).json(err);

            return res.json({
              message: "Document updated successfully",
            });
          }
        );
      } 
      
      // ✅ IF NOT EXISTS → INSERT FLOW
      else {
        const insertSql = `
          INSERT INTO customer_documents
          (customer_id, document_type, file_url, public_id)
          VALUES (?, ?, ?, ?)
        `;

        db.query(
          insertSql,
          [customer_id, document_type, file.path, file.filename],
          (err) => {
            if (err) return res.status(500).json(err);

            return res.json({
              message: "Document uploaded successfully",
            });
          }
        );
      }
    });

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
