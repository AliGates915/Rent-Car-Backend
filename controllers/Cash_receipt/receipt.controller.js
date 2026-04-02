import { db } from "../../config/db.js";
import { addLedgerEntry } from "../../utils/ledger.js";

// CREATE
export const addReceipt = (req, res) => {
  const { amount, source, reference_id, payment_method, notes } = req.body;

  if (!amount) {
    return res.status(400).json({ message: "Amount required" });
  }

  // 🔍 If booking based receipt
  if (source === "booking" && reference_id) {
    // 1. get booking
    db.query(
      `SELECT * FROM bookings WHERE id=?`,
      [reference_id],
      (err, bRows) => {
        if (err) return res.status(500).json(err);
        if (!bRows.length)
          return res.status(404).json({ message: "Booking not found" });

        const booking = bRows[0];
        const customer_id = booking.customer_id;

        const total = Number(booking.total_amount);
        const advance = Number(booking.advance_amount);
        const paid = Number(booking.paid_amount);

        const remaining = total - (advance + paid);
        const payAmount = Number(amount);

        // ❌ overpayment
        if (payAmount > remaining) {
          return res.status(400).json({
            message: `Exceeds remaining amount (${remaining})`,
          });
        }

        // 2. insert receipt
        db.query(
          `INSERT INTO cash_receipts (amount, source, reference_id, payment_method, notes)
         VALUES (?, ?, ?, ?, ?)`,
          [payAmount, source, reference_id, payment_method, notes],
          (err2, result) => {
            if (err2) return res.status(500).json(err2);

            // 3. insert into booking_payments
            db.query(
              `INSERT INTO booking_payments (booking_id, payment_type, amount, payment_method, notes)
             VALUES (?, 'payment', ?, ?, ?)`,
              [reference_id, payAmount, payment_method, notes],
            );

            // 4. update booking summary
            updateBookingPaymentSummary(reference_id, (err3) => {
              if (err3) return res.status(500).json(err3);

              // 5. update customer balance
              db.query(
                `UPDATE customers SET balance = balance - ? WHERE id=?`,
                [payAmount, customer_id],
              );

              addLedgerEntry({
                entry_type: "receipt",
                reference_id: result.insertId,
                reference_table: "cash_receipts",
                debit: payAmount,
                description: "Cash received",
              });
              res.json({
                message: "Receipt added & booking updated",
                receipt_id: result.insertId,
              });
            });
          },
        );
      },
    );
  } else {
    // 🔥 normal receipt (not linked to booking)
    db.query(
      `INSERT INTO cash_receipts (amount, source, reference_id, payment_method, notes)
       VALUES (?, ?, ?, ?, ?)`,
      [amount, source, reference_id, payment_method, notes],
      (err, result) => {
        if (err) return res.status(500).json(err);

        res.json({
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
