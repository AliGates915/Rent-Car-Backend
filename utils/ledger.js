import { db } from "../config/db.js";

export const addLedgerEntry = ({
  entry_type,
  reference_id,
  reference_table,
  customer_id = null,
  vehicle_id = null,
  owner_id = null,
  debit = 0,
  credit = 0,
  description = ""
}) => {

  const sql = `
    INSERT INTO ledgers
    (entry_type, reference_id, reference_table, customer_id, vehicle_id, owner_id, debit, credit, description)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

  db.query(sql, [
    entry_type,
    reference_id,
    reference_table,
    customer_id,
    vehicle_id,
    owner_id,
    debit,
    credit,
    description
  ]);
};