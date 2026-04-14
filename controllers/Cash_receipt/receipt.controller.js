import { db } from "../../config/db.js";
import { addLedgerEntry } from "../../utils/ledger.js";

// GET customer details with balance and booking payment status
export const getCustomerWithBalance = (req, res) => {
  const { customer_id } = req.params;

  // Fetch customer basic info with balance
  db.query(
    `SELECT id, customer_name, phone_no, cnic_no, address, balance 
     FROM customers 
     WHERE id = ?`,
    [customer_id],
    (err, customerRows) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!customerRows.length) {
        return res.status(404).json({ message: "Customer not found" });
      }

      const customer = customerRows[0];

      // Fetch all bookings with payment status
      db.query(
        `SELECT 
          b.id,
          b.booking_code,
          b.date_from,
          b.date_to,
          b.total_amount,
          b.advance_amount,
          b.paid_amount,
          b.security_deposit,
          b.payment_status,
          b.status as booking_status,
          b.created_at,
          v.registration_no,
          v.car_make,
          v.car_model,
          (b.total_amount - (b.advance_amount + b.paid_amount)) as remaining_amount
        FROM bookings b
        INNER JOIN vehicles v ON b.vehicle_id = v.id
        WHERE b.customer_id = ?
        ORDER BY b.created_at DESC`,
        [customer_id],
        (err2, bookings) => {
          if (err2) return res.status(500).json({ error: err2.message });

          // Calculate summary statistics
          const summary = {
            total_bookings: bookings.length,
            total_booking_amount: bookings.reduce((sum, b) => sum + (Number(b.total_amount) || 0), 0),
            total_paid: bookings.reduce((sum, b) => sum + (Number(b.paid_amount) || 0) + (Number(b.advance_amount) || 0), 0),
            total_remaining: bookings.reduce((sum, b) => sum + (Number(b.remaining_amount) || 0), 0),
            payment_status_breakdown: {
              paid: bookings.filter(b => b.payment_status === 'paid').length,
              partial: bookings.filter(b => b.payment_status === 'partial').length,
              unpaid: bookings.filter(b => b.payment_status === 'unpaid').length
            }
          };

          res.json({
            success: true,
            customer: {
              ...customer,
              balance: Number(customer.balance) || 0
            },
            bookings: bookings.map(b => ({
              ...b,
              total_amount: Number(b.total_amount) || 0,
              advance_amount: Number(b.advance_amount) || 0,
              paid_amount: Number(b.paid_amount) || 0,
              remaining_amount: Number(b.remaining_amount) || 0,
              security_deposit: Number(b.security_deposit) || 0
            })),
            summary
          });
        }
      );
    }
  );
};

// GET all customers with their balance and booking payment summary
export const getAllCustomersWithBalance = (req, res) => {
  const { search } = req.query;

  let sql = `
    SELECT 
      c.id,
      c.customer_name,
      c.phone_no,
      c.cnic_no,
      COALESCE(c.balance, 0) as balance,
      COUNT(b.id) as total_bookings,
      COALESCE(SUM(b.total_amount), 0) as total_booking_amount,
      COALESCE(SUM(b.advance_amount + b.paid_amount), 0) as total_paid_amount,
      COALESCE(SUM(b.total_amount - (b.advance_amount + b.paid_amount)), 0) as total_remaining_amount,
      SUM(CASE WHEN b.payment_status = 'paid' THEN 1 ELSE 0 END) as paid_bookings,
      SUM(CASE WHEN b.payment_status = 'partial' THEN 1 ELSE 0 END) as partial_bookings,
      SUM(CASE WHEN b.payment_status = 'unpaid' THEN 1 ELSE 0 END) as unpaid_bookings
    FROM customers c
    LEFT JOIN bookings b ON c.id = b.customer_id AND b.status != 'cancelled'
    WHERE 1=1
  `;

  const params = [];

  if (search) {
    sql += ` AND (c.customer_name LIKE ? OR c.phone_no LIKE ? OR c.cnic_no LIKE ?)`;
    const searchPattern = `%${search}%`;
    params.push(searchPattern, searchPattern, searchPattern);
  }

  sql += ` GROUP BY c.id`;
  
  // Only show customers with balance > 0
  sql += ` HAVING balance > 0 OR total_remaining_amount > 0`;
  
  sql += ` ORDER BY balance DESC, total_remaining_amount DESC`;

  db.query(sql, params, (err, rows) => {
    if (err) {
      console.error('Query error:', err);
      return res.status(500).json({ error: err.message });
    }

    res.json({
      success: true,
      data: rows.map(row => ({
        id: row.id,
        customer_name: row.customer_name,
        phone_no: row.phone_no,
        cnic_no: row.cnic_no,
        email: row.email,
        address: row.address,
        balance: Number(row.balance) || 0,
        total_bookings: Number(row.total_bookings) || 0,
        total_booking_amount: Number(row.total_booking_amount) || 0,
        total_paid_amount: Number(row.total_paid_amount) || 0,
        total_remaining_amount: Number(row.total_remaining_amount) || 0,
        paid_bookings: Number(row.paid_bookings) || 0,
        partial_bookings: Number(row.partial_bookings) || 0,
        unpaid_bookings: Number(row.unpaid_bookings) || 0
      }))
    });
  });
};


// Helper function to update customer balance
const updateCustomerBalance = (customer_id, callback) => {
  // Calculate total outstanding from all bookings
  db.query(
    `SELECT 
       SUM(total_amount - (advance_amount + paid_amount)) as total_outstanding
     FROM bookings 
     WHERE customer_id = ? AND status != 'cancelled'`,
    [customer_id],
    (err, result) => {
      if (err) return callback(err);
      
      const outstanding = Number(result[0]?.total_outstanding) || 0;
      
      // Update customer balance
      db.query(
        `UPDATE customers SET balance = ? WHERE id = ?`,
        [outstanding, customer_id],
        (err2) => callback(err2)
      );
    }
  );
};

// Helper function to update booking payment summary
const updateBookingPaymentSummary = (booking_id, callback) => {
  db.query(
    `SELECT 
       COALESCE(SUM(amount), 0) as total_paid
     FROM booking_payments 
     WHERE booking_id = ?`,
    [booking_id],
    (err, result) => {
      if (err) return callback(err);
      
      const totalPaid = Number(result[0]?.total_paid) || 0;
      
      db.query(
        `UPDATE bookings 
         SET paid_amount = ?,
             payment_status = CASE 
               WHEN ? >= total_amount THEN 'paid'
               WHEN ? > 0 THEN 'partial'
               ELSE 'unpaid'
             END
         WHERE id = ?`,
        [totalPaid, totalPaid, totalPaid, booking_id],
        (err2) => callback(err2)
      );
    }
  );
};

// Add Receipt function
export const addReceipt = (req, res) => {
  const { amount, source, reference_id, payment_method, notes, customer_id } = req.body;

  if (!amount) {
    return res.status(400).json({ message: "Amount required" });
  }

  // If customer_id provided, update their balance directly
  if (customer_id) {
    db.query(
      `INSERT INTO cash_receipts (amount, source, reference_id, payment_method, notes, customer_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, NOW())`,
      [amount, source, reference_id || null, payment_method, notes, customer_id],
      (err, result) => {
        if (err) {
          console.error('Error inserting receipt:', err);
          return res.status(500).json({ error: err.message });
        }
        
        // Update customer balance
        updateCustomerBalance(customer_id, (err2) => {
          if (err2) {
            console.error('Error updating balance:', err2);
            return res.status(500).json({ error: err2.message });
          }
          
          res.json({
            success: true,
            message: "Receipt added & customer balance updated",
            receipt_id: result.insertId
          });
        });
      }
    );
  }
  // Booking based receipt
  else if (source === "booking" && reference_id) {
    db.query(
      `SELECT * FROM bookings WHERE id=?`,
      [reference_id],
      (err, bRows) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!bRows.length)
          return res.status(404).json({ message: "Booking not found" });

        const booking = bRows[0];
        const customerId = booking.customer_id;
        const total = Number(booking.total_amount);
        const advance = Number(booking.advance_amount);
        const paid = Number(booking.paid_amount);
        const remaining = total - (advance + paid);
        const payAmount = Number(amount);

        if (payAmount > remaining) {
          return res.status(400).json({
            message: `Amount exceeds remaining amount (${remaining})`,
          });
        }

        db.query(
          `INSERT INTO cash_receipts (amount, source, reference_id, payment_method, notes, customer_id, created_at)
           VALUES (?, ?, ?, ?, ?, ?, NOW())`,
          [payAmount, source, reference_id, payment_method, notes, customerId],
          (err2, result) => {
            if (err2) {
              console.error('Error inserting receipt:', err2);
              return res.status(500).json({ error: err2.message });
            }

            db.query(
              `INSERT INTO booking_payments (booking_id, payment_type, amount, payment_method, notes, created_at)
               VALUES (?, 'payment', ?, ?, ?, NOW())`,
              [reference_id, payAmount, payment_method, notes],
              (err3) => {
                if (err3) console.error('Error inserting booking payment:', err3);
              }
            );

            updateBookingPaymentSummary(reference_id, (err3) => {
              if (err3) {
                console.error('Error updating booking summary:', err3);
                return res.status(500).json({ error: err3.message });
              }

              // Update customer balance
              updateCustomerBalance(customerId, (err4) => {
                if (err4) {
                  console.error('Error updating customer balance:', err4);
                  return res.status(500).json({ error: err4.message });
                }
                
                res.json({
                  success: true,
                  message: "Receipt added & booking updated",
                  receipt_id: result.insertId,
                });
              });
            });
          },
        );
      },
    );
  } else {
    // General receipt
    db.query(
      `INSERT INTO cash_receipts (amount, source, reference_id, payment_method, notes, created_at)
       VALUES (?, ?, ?, ?, ?, NOW())`,
      [amount, source, reference_id || null, payment_method, notes],
      (err, result) => {
        if (err) {
          console.error('Error inserting general receipt:', err);
          return res.status(500).json({ error: err.message });
        }
        res.json({
          success: true,
          message: "General receipt added",
          id: result.insertId,
        });
      },
    );
  }
};

// UPDATE
export const updateReceipt = (req, res) => {
  const { id } = req.params;
  const { amount, source, reference_id, payment_method, notes } = req.body;

  // 1. old receipt get karo
  db.query(`SELECT * FROM cash_receipts WHERE id=?`, [id], (err, rows) => {
    if (err) return res.status(500).json(err);
    if (!rows.length)
      return res.status(404).json({ message: "Receipt not found" });

    const oldReceipt = rows[0];

    const oldAmount = Number(oldReceipt.amount);
    const newAmount = Number(amount);

    const diff = newAmount - oldAmount; // 🔥 IMPORTANT

    // 2. agar booking linked hai
    if (oldReceipt.source === "booking" && oldReceipt.reference_id) {
      db.query(
        `SELECT * FROM bookings WHERE id=?`,
        [oldReceipt.reference_id],
        (err2, bRows) => {
          if (err2) return res.status(500).json(err2);
          if (!bRows.length)
            return res.status(404).json({ message: "Booking not found" });

          const booking = bRows[0];

          const total = Number(booking.total_amount);
          const advance = Number(booking.advance_amount);
          const paid = Number(booking.paid_amount);

          const remaining = total - (advance + paid);

          // ❌ overpayment check (sirf positive diff pe)
          if (diff > 0 && diff > remaining) {
            return res.status(400).json({
              message: `Update exceeds remaining amount (${remaining})`,
            });
          }

          // 3. receipt update
          db.query(
            `UPDATE cash_receipts 
           SET amount=?, source=?, reference_id=?, payment_method=?, notes=? 
           WHERE id=?`,
            [newAmount, source, reference_id, payment_method, notes, id],
            (err3) => {
              if (err3) return res.status(500).json(err3);

              // 4. booking_payments update
              db.query(
                `UPDATE booking_payments 
               SET amount=?, payment_method=?, notes=? 
               WHERE booking_id=? 
               ORDER BY id DESC LIMIT 1`,
                [newAmount, payment_method, notes, oldReceipt.reference_id],
              );

              // 5. update booking summary
              updateBookingPaymentSummary(oldReceipt.reference_id, (err4) => {
                if (err4) return res.status(500).json(err4);

                // 6. update customer balance (diff apply)
                db.query(
                  `UPDATE customers SET balance = balance - ? WHERE id=?`,
                  [diff, booking.customer_id],
                );

                addLedgerEntry({
                  entry_type: "receipt",
                  reference_id: result.insertId,
                  reference_table: "cash_receipts",
                  debit: payAmount,
                  description: "Cash received",
                });
                res.json({
                  message: "Receipt updated successfully",
                  difference_applied: diff,
                });
              });
            },
          );
        },
      );
    } else {
      // 🔥 normal receipt (non-booking)
      db.query(
        `UPDATE cash_receipts 
         SET amount=?, source=?, reference_id=?, payment_method=?, notes=? 
         WHERE id=?`,
        [newAmount, source, reference_id, payment_method, notes, id],
        (err5) => {
          if (err5) return res.status(500).json(err5);

          res.json({ message: "Receipt updated" });
        },
      );
    }
  });
};

// GET ALL
export const getReceipts = (req, res) => {
  db.query(`SELECT * FROM cash_receipts ORDER BY id DESC`, (err, rows) => {
    if (err) return res.status(500).json(err);
    res.json(rows);
  });
};

// GET BY ID
export const getReceiptById = (req, res) => {
  const { id } = req.params;

  db.query(`SELECT * FROM cash_receipts WHERE id=?`, [id], (err, rows) => {
    if (err) return res.status(500).json(err);
    if (!rows.length) return res.status(404).json({ message: "Not found" });

    res.json(rows[0]);
  });
};

// DELETE
export const deleteReceipt = (req, res) => {
  const { id } = req.params;

  // 1. get receipt
  db.query(`SELECT * FROM cash_receipts WHERE id=?`, [id], (err, rows) => {
    if (err) return res.status(500).json(err);
    if (!rows.length)
      return res.status(404).json({ message: "Receipt not found" });

    const receipt = rows[0];
    const amount = Number(receipt.amount);

    // 🔥 if linked to booking
    if (receipt.source === "booking" && receipt.reference_id) {
      db.query(
        `SELECT * FROM bookings WHERE id=?`,
        [receipt.reference_id],
        (err2, bRows) => {
          if (err2) return res.status(500).json(err2);
          if (!bRows.length)
            return res.status(404).json({ message: "Booking not found" });

          const booking = bRows[0];
          const customer_id = booking.customer_id;

          // 2. delete receipt
          db.query(`DELETE FROM cash_receipts WHERE id=?`, [id], (err3) => {
            if (err3) return res.status(500).json(err3);

            // 3. delete from booking_payments (⚠️ risky part)
            db.query(
              `DELETE FROM booking_payments 
             WHERE booking_id=? 
             ORDER BY id DESC LIMIT 1`,
              [receipt.reference_id],
            );

            // 4. update booking summary
            updateBookingPaymentSummary(receipt.reference_id, (err4) => {
              if (err4) return res.status(500).json(err4);

              // 5. reverse customer balance
              db.query(
                `UPDATE customers SET balance = balance + ? WHERE id=?`,
                [amount, customer_id],
              );

              res.json({
                message: "Receipt deleted & reversed",
                reversed_amount: amount,
              });
            });
          });
        },
      );
    } else {
      // 🔥 normal receipt
      db.query(`DELETE FROM cash_receipts WHERE id=?`, [id], (err5) => {
        if (err5) return res.status(500).json(err5);

        res.json({ message: "Receipt deleted" });
      });
    }
  });
};

// REPORT
export const getReceiptReport = (req, res) => {
  const { from, to } = req.query;

  db.query(
    `SELECT * FROM cash_receipts WHERE DATE(created_at) BETWEEN ? AND ?`,
    [from, to],
    (err, rows) => {
      if (err) return res.status(500).json(err);

      res.json(rows);
    },
  );
};
