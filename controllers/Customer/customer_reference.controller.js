import { db } from "../../config/db.js";

export const addCustomerReference = (req, res) => {
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

  db.query(
    sql,
    [
      customer_id,
      reference_name,
      reference_father || null,
      reference_phone_no || null,
      reference_cnic || null,
      reference_address || null,
      relation_with_customer || null,
    ],
    (err) => {
      if (err) return res.status(500).json(err);

      res.json({ message: "Reference added" });
    }
  );
};