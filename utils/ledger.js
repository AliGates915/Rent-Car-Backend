// backend/utils/ledger.js
import { pool } from "../config/db.js";

// Async version (recommended)
export const addLedgerEntry = async (data, connection = null) => {
  const {
    entry_type,
    reference_id,
    reference_table,
    customer_id = null,
    vehicle_id = null,
    owner_id = null,
    debit = 0,
    credit = 0,
    description = ""
  } = data;

  const sql = `
    INSERT INTO ledgers
    (entry_type, reference_id, reference_table, customer_id, vehicle_id, owner_id, debit, credit, description, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
  `;

  const params = [
    entry_type,
    reference_id || null,
    reference_table || null,
    customer_id || null,
    vehicle_id || null,
    owner_id || null,
    debit || 0,
    credit || 0,
    description || null
  ];

  try {
    const db = connection || pool;
    const [result] = await db.query(sql, params);
    return result;
  } catch (error) {
    console.error('Error adding ledger entry:', error);
    throw error;
  }
};

// Sync version (for backward compatibility - NOT RECOMMENDED)
export const addLedgerEntrySync = (data) => {
  const {
    entry_type,
    reference_id,
    reference_table,
    customer_id = null,
    vehicle_id = null,
    owner_id = null,
    debit = 0,
    credit = 0,
    description = ""
  } = data;

  const sql = `
    INSERT INTO ledgers
    (entry_type, reference_id, reference_table, customer_id, vehicle_id, owner_id, debit, credit, description, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
  `;

  const params = [
    entry_type,
    reference_id || null,
    reference_table || null,
    customer_id || null,
    vehicle_id || null,
    owner_id || null,
    debit || 0,
    credit || 0,
    description || null
  ];

  // This will still use pool but without await (fire and forget)
  pool.query(sql, params).catch(err => console.error('Ledger entry error:', err));
};