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
      if (err) {
        console.error('Error fetching customer:', err);
        return res.status(500).json({ error: err.message });
      }
      if (!customerRows.length) {
        return res.status(404).json({ message: "Customer not found" });
      }

      const customer = customerRows[0];

      // Fetch all bookings with payment status AND owner earnings
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
          v.owner_id,
          v.owner_percentage,
          (b.total_amount - (b.advance_amount + b.paid_amount)) as remaining_amount,
          oe.id as earning_id,
          oe.owner_amount,
          oe.company_amount,
          oe.status as earnings_status
        FROM bookings b
        INNER JOIN vehicles v ON b.vehicle_id = v.id
        LEFT JOIN owner_earnings oe ON b.id = oe.booking_id
        WHERE b.customer_id = ?
        ORDER BY b.created_at DESC`,
        [customer_id],
        (err2, bookings) => {
          if (err2) {
            console.error('Error fetching bookings:', err2);
            return res.status(500).json({ error: err2.message });
          }

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

          // Format bookings with owner earnings info
          const formattedBookings = bookings.map(b => ({
            id: b.id,
            booking_code: b.booking_code,
            date_from: b.date_from,
            date_to: b.date_to,
            total_amount: Number(b.total_amount) || 0,
            advance_amount: Number(b.advance_amount) || 0,
            paid_amount: Number(b.paid_amount) || 0,
            remaining_amount: Number(b.remaining_amount) || 0,
            security_deposit: Number(b.security_deposit) || 0,
            payment_status: b.payment_status,
            booking_status: b.booking_status,
            registration_no: b.registration_no,
            // Include owner earnings info
            owner_earnings: b.earning_id ? {
              id: b.earning_id,
              owner_amount: Number(b.owner_amount) || 0,
              company_amount: Number(b.company_amount) || 0,
              status: b.earnings_status
            } : null,
            // For frontend convenience
            owner_remaining: Number(b.owner_amount) || 0,
            company_remaining: Number(b.company_amount) || 0
          }));

          res.json({
            success: true,
            customer: {
              id: customer.id,
              customer_name: customer.customer_name,
              phone_no: customer.phone_no,
              cnic_no: customer.cnic_no,
              address: customer.address,
              balance: Number(customer.balance) || 0
            },
            bookings: formattedBookings,
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
      c.address,
      COALESCE(c.balance, 0) as balance,
      COUNT(DISTINCT b.id) as total_bookings,
      COALESCE(SUM(b.total_amount), 0) as total_booking_amount,
      COALESCE(SUM(b.advance_amount + b.paid_amount), 0) as total_paid_amount,
      COALESCE(SUM(b.total_amount - (b.advance_amount + b.paid_amount)), 0) as total_remaining_amount,
      SUM(CASE WHEN b.payment_status = 'paid' THEN 1 ELSE 0 END) as paid_bookings,
      SUM(CASE WHEN b.payment_status = 'partial' THEN 1 ELSE 0 END) as partial_bookings,
      SUM(CASE WHEN b.payment_status = 'unpaid' THEN 1 ELSE 0 END) as unpaid_bookings,
      COALESCE(SUM(oe.owner_amount), 0) as total_owner_due,
      COALESCE(SUM(oe.company_amount), 0) as total_company_due
    FROM customers c
    LEFT JOIN bookings b ON c.id = b.customer_id AND b.status IN ('ongoing', 'completed')
    LEFT JOIN owner_earnings oe ON b.id = oe.booking_id AND oe.status = 'unpaid'
    WHERE 1=1
  `;

  const params = [];

  if (search) {
    sql += ` AND (c.customer_name LIKE ? OR c.phone_no LIKE ? OR c.cnic_no LIKE ?)`;
    const searchPattern = `%${search}%`;
    params.push(searchPattern, searchPattern, searchPattern);
  }

  sql += ` GROUP BY c.id`;
  
  // Only show customers with balance > 0 or remaining amount > 0
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
        address: row.address,
        balance: Number(row.balance) || 0,
        total_bookings: Number(row.total_bookings) || 0,
        total_booking_amount: Number(row.total_booking_amount) || 0,
        total_paid_amount: Number(row.total_paid_amount) || 0,
        total_remaining_amount: Number(row.total_remaining_amount) || 0,
        paid_bookings: Number(row.paid_bookings) || 0,
        partial_bookings: Number(row.partial_bookings) || 0,
        unpaid_bookings: Number(row.unpaid_bookings) || 0,
        total_owner_due: Number(row.total_owner_due) || 0,
        total_company_due: Number(row.total_company_due) || 0
      }))
    });
  });
};

// Helper function to update customer balance
const updateCustomerBalance = (customer_id, callback) => {
  // Calculate total outstanding from all completed/ongoing bookings
  db.query(
    `SELECT 
       b.id,
       b.total_amount,
       COALESCE(SUM(bp.amount), 0) as total_paid
     FROM bookings b
     LEFT JOIN booking_payments bp ON b.id = bp.booking_id 
       AND bp.payment_type IN ('advance', 'payment')
     WHERE b.customer_id = ? 
       AND b.status IN ('ongoing', 'completed')
     GROUP BY b.id`,
    [customer_id],
    (err, bookings) => {
      if (err) return callback(err);
      
      let totalOutstanding = 0;
      bookings.forEach(booking => {
        const outstanding = Number(booking.total_amount) - Number(booking.total_paid);
        if (outstanding > 0) {
          totalOutstanding += outstanding;
        }
      });
      
      // Update customer balance (positive means customer owes us, negative means we owe customer)
      db.query(
        `UPDATE customers SET balance = ? WHERE id = ?`,
        [totalOutstanding, customer_id],
        (err2) => {
          if (err2) return callback(err2);
          callback(null, totalOutstanding);
        }
      );
    }
  );
};

// // Helper function to add ledger entries
// const addLedgerEntry = (data, callback) => {
//   const { entry_type, reference_id, reference_table, customer_id, amount, description, debit, credit } = data;
  
//   const query = `
//     INSERT INTO ledger_entries 
//     (entry_type, reference_id, reference_table, customer_id, amount, debit, credit, description, created_at)
//     VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())
//   `;
  
//   db.query(query, [
//     entry_type, 
//     reference_id, 
//     reference_table, 
//     customer_id || null, 
//     amount || null,
//     debit || 0,
//     credit || 0,
//     description || null
//   ], (err, result) => {
//     if (err) console.error('Error adding ledger entry:', err);
//     if (callback) callback(err, result);
//   });
// };

// Helper function to update booking payment summary
const updateBookingPaymentSummary = (bookingId, callback) => {
  // Get total payments from booking_payments table
  db.query(
    `SELECT 
       COALESCE(SUM(CASE WHEN payment_type IN ('advance', 'payment') THEN amount ELSE 0 END), 0) as total_paid,
       COALESCE(SUM(CASE WHEN payment_type = 'security_deposit' THEN amount ELSE 0 END), 0) as total_deposit
     FROM booking_payments 
     WHERE booking_id = ?`,
    [bookingId],
    (err, result) => {
      if (err) return callback(err);
      
      const totalPaid = Number(result[0]?.total_paid || 0);
      const totalDeposit = Number(result[0]?.total_deposit || 0);
      
      // Get booking total amount
      db.query(
        `SELECT total_amount, advance_amount FROM bookings WHERE id = ?`,
        [bookingId],
        (err2, bookingRows) => {
          if (err2) return callback(err2);
          if (!bookingRows.length) return callback(new Error("Booking not found"));
          
          const booking = bookingRows[0];
          const totalAmount = Number(booking.total_amount);
          const advanceAmount = Number(booking.advance_amount);
          
          // Calculate payment status
          let paymentStatus = 'unpaid';
          if (totalPaid >= totalAmount) {
            paymentStatus = 'paid';
          } else if (totalPaid > 0) {
            paymentStatus = 'partial';
          }
          
          // Update booking record
          db.query(
            `UPDATE bookings 
             SET paid_amount = ?, 
                 payment_status = ?,
                 updated_at = NOW()
             WHERE id = ?`,
            [totalPaid - advanceAmount, paymentStatus, bookingId],
            (err3) => {
              if (err3) return callback(err3);
              callback(null, { totalPaid, paymentStatus, totalDeposit });
            }
          );
        }
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

  // Helper function to update owner earnings when payment is made
  const updateOwnerAndCompanyEarnings = (bookingId, paymentAmount, callback) => {
    // Get the owner earnings record for this booking
    db.query(
      `SELECT oe.*, b.total_amount 
       FROM owner_earnings oe
       JOIN bookings b ON oe.booking_id = b.id
       WHERE oe.booking_id = ? AND oe.status = 'unpaid'`,
      [bookingId],
      (err, earningsRows) => {
        if (err) return callback(err);
        
        if (earningsRows.length === 0) {
          // No unpaid earnings found, might already be paid
          return callback(null, { message: "No unpaid earnings found for this booking" });
        }
        
        const earnings = earningsRows[0];
        let remainingOwnerAmount = earnings.owner_amount;
        let remainingCompanyAmount = earnings.company_amount;
        let remainingPayment = paymentAmount;
        
        // First, pay company amount (company gets paid first)
        let companyPaid = 0;
        let ownerPaid = 0;
        
        if (remainingPayment > 0 && remainingCompanyAmount > 0) {
          companyPaid = Math.min(remainingPayment, remainingCompanyAmount);
          remainingCompanyAmount -= companyPaid;
          remainingPayment -= companyPaid;
        }
        
        // Then pay owner amount
        if (remainingPayment > 0 && remainingOwnerAmount > 0) {
          ownerPaid = Math.min(remainingPayment, remainingOwnerAmount);
          remainingOwnerAmount -= ownerPaid;
          remainingPayment -= ownerPaid;
        }
        
        // Update owner_earnings record
        const newOwnerAmount = remainingOwnerAmount;
        const newCompanyAmount = remainingCompanyAmount;
        const newStatus = (newOwnerAmount === 0 && newCompanyAmount === 0) ? 'paid' : 'unpaid';
        
        db.query(
          `UPDATE owner_earnings 
           SET owner_amount = ?, company_amount = ?, status = ?, updated_at = NOW()
           WHERE id = ?`,
          [newOwnerAmount, newCompanyAmount, newStatus, earnings.id],
          (updateErr) => {
            if (updateErr) return callback(updateErr);
            
            // Record payment distribution in a new table (optional - for tracking)
            const distributionQuery = `
              INSERT INTO earning_payments 
              (earning_id, booking_id, company_paid, owner_paid, payment_date, created_at)
              VALUES (?, ?, ?, ?, NOW(), NOW())
            `;
            
            db.query(distributionQuery, [
              earnings.id, bookingId, companyPaid, ownerPaid
            ], (insertErr) => {
              if (insertErr) console.error('Error recording payment distribution:', insertErr);
              
              callback(null, {
                companyPaid,
                ownerPaid,
                remainingCompanyAmount: newCompanyAmount,
                remainingOwnerAmount: newOwnerAmount,
                status: newStatus
              });
            });
          }
        );
      }
    );
  };

  // If customer_id provided, update their balance directly
  if (customer_id) {
    // Check if this payment is for a previous booking
    db.query(
      `SELECT b.id as booking_id, b.status, b.payment_status, b.customer_id
       FROM bookings b
       WHERE b.customer_id = ? AND b.payment_status IN ('unpaid', 'partial')
       ORDER BY b.created_at ASC`,
      [customer_id],
      (err, bookings) => {
        if (err) {
          console.error('Error fetching customer bookings:', err);
          return res.status(500).json({ error: err.message });
        }
        
        let remainingAmount = Number(amount);
        let processedBookings = [];
        
        // Process payments against outstanding bookings
        const processNextBooking = (index) => {
          if (index >= bookings.length || remainingAmount <= 0) {
            // All payments processed or no more bookings
            // Insert the receipt
            db.query(
              `INSERT INTO cash_receipts (amount, source, reference_id, payment_method, notes, customer_id, created_at)
               VALUES (?, ?, ?, ?, ?, ?, NOW())`,
              [amount, source, reference_id || null, payment_method, notes, customer_id],
              (err2, result) => {
                if (err2) {
                  console.error('Error inserting receipt:', err2);
                  return res.status(500).json({ error: err2.message });
                }
                
                // Update customer balance
                updateCustomerBalance(customer_id, (err3) => {
                  if (err3) {
                    console.error('Error updating customer balance:', err3);
                    return res.status(500).json({ error: err3.message });
                  }
                  
                  res.json({
                    success: true,
                    message: "Receipt added & balances updated",
                    receipt_id: result.insertId,
                    payments_processed: processedBookings,
                    remaining_amount: remainingAmount
                  });
                });
              }
            );
            return;
          }
          
          const booking = bookings[index];
          
          // Get total paid for this booking
          db.query(
            `SELECT SUM(amount) as total_paid 
             FROM booking_payments 
             WHERE booking_id = ? AND payment_type IN ('advance', 'payment')`,
            [booking.booking_id],
            (err4, paymentResult) => {
              if (err4) {
                console.error('Error getting booking payments:', err4);
                return processNextBooking(index + 1);
              }
              
              db.query(
                `SELECT total_amount FROM bookings WHERE id = ?`,
                [booking.booking_id],
                (err5, bookingResult) => {
                  if (err5) {
                    console.error('Error getting booking total:', err5);
                    return processNextBooking(index + 1);
                  }
                  
                  const totalAmount = Number(bookingResult[0].total_amount);
                  const totalPaid = Number(paymentResult[0]?.total_paid || 0);
                  const outstanding = totalAmount - totalPaid;
                  
                  if (outstanding <= 0) {
                    return processNextBooking(index + 1);
                  }
                  
                  const paymentForThisBooking = Math.min(remainingAmount, outstanding);
                  
                  // Insert payment record
                  db.query(
                    `INSERT INTO booking_payments (booking_id, payment_type, amount, payment_method, notes, created_at)
                     VALUES (?, 'payment', ?, ?, ?, NOW())`,
                    [booking.booking_id, paymentForThisBooking, payment_method, `Payment towards booking - ${notes || ''}`],
                    (err6) => {
                      if (err6) {
                        console.error('Error inserting booking payment:', err6);
                      }
                      
                      // Update booking payment summary
                      updateBookingPaymentSummary(booking.booking_id, (err7) => {
                        if (err7) {
                          console.error('Error updating booking summary:', err7);
                        }
                        
                        // Update owner and company earnings for this booking
                        updateOwnerAndCompanyEarnings(booking.booking_id, paymentForThisBooking, (err8, distribution) => {
                          if (err8) {
                            console.error('Error updating owner/company earnings:', err8);
                          }
                          
                          processedBookings.push({
                            booking_id: booking.booking_id,
                            amount: paymentForThisBooking,
                            company_paid: distribution?.companyPaid || 0,
                            owner_paid: distribution?.ownerPaid || 0
                          });
                          
                          remainingAmount -= paymentForThisBooking;
                          processNextBooking(index + 1);
                        });
                      });
                    }
                  );
                }
              );
            }
          );
        };
        
        if (bookings.length === 0) {
          // No outstanding bookings, just add as general receipt
          db.query(
            `INSERT INTO cash_receipts (amount, source, reference_id, payment_method, notes, customer_id, created_at)
             VALUES (?, ?, ?, ?, ?, ?, NOW())`,
            [amount, source, reference_id || null, payment_method, notes, customer_id],
            (err2, result) => {
              if (err2) {
                console.error('Error inserting receipt:', err2);
                return res.status(500).json({ error: err2.message });
              }
              
              updateCustomerBalance(customer_id, (err3) => {
                if (err3) {
                  console.error('Error updating customer balance:', err3);
                  return res.status(500).json({ error: err3.message });
                }
                
                res.json({
                  success: true,
                  message: "Receipt added (no outstanding bookings)",
                  receipt_id: result.insertId
                });
              });
            }
          );
        } else {
          processNextBooking(0);
        }
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
        const paid = Number(booking.paid_amount);
        const remaining = total - paid;
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
                
                // Update owner and company earnings for this payment
                updateOwnerAndCompanyEarnings(reference_id, payAmount, (err5, distribution) => {
                  if (err5) {
                    console.error('Error updating owner/company earnings:', err5);
                    // Don't fail the request, just log the error
                  }
                  
                  res.json({
                    success: true,
                    message: "Receipt added & booking updated",
                    receipt_id: result.insertId,
                    earnings_distribution: distribution || null
                  });
                });
              });
            });
          },
        );
      },
    );
  } else {
    // General receipt - no owner/company updates needed
    db.query(
      `INSERT INTO cash_receipts (amount, source, reference_id, payment_method, notes, customer_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, NOW())`,
      [amount, source, reference_id || null, payment_method, notes, null],
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

// UPDATE - Fixed version
export const updateReceipt = (req, res) => {
  const { id } = req.params;
  const { amount, source, reference_id, payment_method, notes } = req.body;

  // 1. Get old receipt
  db.query(`SELECT * FROM cash_receipts WHERE id=?`, [id], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!rows.length)
      return res.status(404).json({ message: "Receipt not found" });

    const oldReceipt = rows[0];
    const oldAmount = Number(oldReceipt.amount);
    const newAmount = Number(amount);
    const diff = newAmount - oldAmount; // Positive = increase, Negative = decrease

    // 2. If linked to booking
    if (oldReceipt.source === "booking" && oldReceipt.reference_id) {
      db.query(
        `SELECT b.*, bp.total_paid 
         FROM bookings b
         LEFT JOIN (
           SELECT booking_id, SUM(amount) as total_paid 
           FROM booking_payments 
           WHERE payment_type IN ('advance', 'payment')
           GROUP BY booking_id
         ) bp ON b.id = bp.booking_id
         WHERE b.id=?`,
        [oldReceipt.reference_id],
        (err2, bRows) => {
          if (err2) return res.status(500).json({ error: err2.message });
          if (!bRows.length)
            return res.status(404).json({ message: "Booking not found" });

          const booking = bRows[0];
          const totalPaid = Number(booking.total_paid || 0);
          const totalAmount = Number(booking.total_amount);
          const remaining = totalAmount - totalPaid;

          // Check overpayment (only for positive diff)
          if (diff > 0 && diff > remaining + oldAmount) {
            return res.status(400).json({
              message: `Update would exceed remaining amount. Remaining: ${remaining}, Old receipt: ${oldAmount}`
            });
          }

          // 3. Update receipt
          db.query(
            `UPDATE cash_receipts 
             SET amount=?, source=?, reference_id=?, payment_method=?, notes=? 
             WHERE id=?`,
            [newAmount, source, reference_id, payment_method, notes, id],
            (err3) => {
              if (err3) return res.status(500).json({ error: err3.message });

              // 4. Update the latest booking_payment record for this receipt
              db.query(
                `UPDATE booking_payments 
                 SET amount=?, payment_method=?, notes=? 
                 WHERE booking_id=? AND payment_type='payment'
                 ORDER BY id DESC LIMIT 1`,
                [newAmount, payment_method, notes, oldReceipt.reference_id],
                (err4) => {
                  if (err4) console.error('Error updating booking payment:', err4);
                  
                  // 5. Update booking payment summary
                  updateBookingPaymentSummary(oldReceipt.reference_id, (err5) => {
                    if (err5) {
                      console.error('Error updating booking summary:', err5);
                      return res.status(500).json({ error: err5.message });
                    }

                    // 6. Update customer balance with the difference
                    updateCustomerBalance(booking.customer_id, (err6, newBalance) => {
                      if (err6) {
                        console.error('Error updating customer balance:', err6);
                        return res.status(500).json({ error: err6.message });
                      }

                      // 7. Update owner earnings if amount changed
                      if (diff !== 0) {
                        updateOwnerAndCompanyEarnings(oldReceipt.reference_id, diff, (err7, distribution) => {
                          if (err7) {
                            console.error('Error updating owner earnings:', err7);
                          }
                          
                          // Add ledger entry
                          addLedgerEntry({
                            entry_type: "receipt_update",
                            reference_id: id,
                            reference_table: "cash_receipts",
                            customer_id: booking.customer_id,
                            amount: Math.abs(diff),
                            debit: diff > 0 ? diff : 0,
                            credit: diff < 0 ? Math.abs(diff) : 0,
                            description: `Receipt updated from ${oldAmount} to ${newAmount}`
                          });
                          
                          res.json({
                            success: true,
                            message: "Receipt updated successfully",
                            difference_applied: diff,
                            new_balance: newBalance,
                            earnings_distribution: distribution || null
                          });
                        });
                      } else {
                        res.json({
                          success: true,
                          message: "Receipt updated successfully (no amount change)",
                          new_balance: newBalance
                        });
                      }
                    });
                  });
                }
              );
            }
          );
        }
      );
    } else {
      // Non-booking receipt
      db.query(
        `UPDATE cash_receipts 
         SET amount=?, source=?, reference_id=?, payment_method=?, notes=? 
         WHERE id=?`,
        [newAmount, source, reference_id, payment_method, notes, id],
        (err5) => {
          if (err5) return res.status(500).json({ error: err5.message });
          
          // If receipt has customer_id, update balance
          if (oldReceipt.customer_id) {
            updateCustomerBalance(oldReceipt.customer_id, (err6, newBalance) => {
              if (err6) console.error('Error updating customer balance:', err6);
              
              res.json({
                success: true,
                message: "Receipt updated",
                new_balance: newBalance
              });
            });
          } else {
            res.json({ success: true, message: "Receipt updated" });
          }
        }
      );
    }
  });
};

// GET ALL with customer name
export const getReceipts = (req, res) => {
  const query = `
    SELECT 
      cr.*,
      c.customer_name as customer_name,
      CASE 
        WHEN cr.source = 'booking' AND cr.reference_id IS NOT NULL THEN CONCAT('Booking #', cr.reference_id)
        WHEN cr.customer_id IS NOT NULL THEN c.customer_name
        ELSE cr.source
      END as received_from,
      CASE 
        WHEN cr.source = 'booking' THEN 'Booking Payment'
        WHEN cr.customer_id IS NOT NULL THEN 'Customer Payment'
        ELSE 'General Receipt'
      END as head
    FROM cash_receipts cr
    LEFT JOIN customers c ON cr.customer_id = c.id
    ORDER BY cr.id DESC
  `;
  
  db.query(query, (err, rows) => {
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

// DELETE receipt - Fixed version
export const deleteReceipt = (req, res) => {
  const { id } = req.params;

  // Get receipt details before deletion
  db.query(`SELECT * FROM cash_receipts WHERE id=?`, [id], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!rows.length)
      return res.status(404).json({ message: "Receipt not found" });

    const receipt = rows[0];
    const amount = Number(receipt.amount);

    // If linked to booking, reverse the payment
    if (receipt.source === "booking" && receipt.reference_id) {
      db.query(
        `SELECT * FROM bookings WHERE id=?`,
        [receipt.reference_id],
        (err2, bRows) => {
          if (err2) return res.status(500).json({ error: err2.message });
          if (!bRows.length) {
            // No booking found, just delete receipt
            deleteReceiptOnly(id, receipt, res);
            return;
          }

          const booking = bRows[0];
          
          // Delete the associated booking_payment record
          db.query(
            `DELETE FROM booking_payments 
             WHERE booking_id=? AND payment_type='payment' AND amount=?
             ORDER BY id DESC LIMIT 1`,
            [receipt.reference_id, amount],
            (err3) => {
              if (err3) console.error('Error deleting booking payment:', err3);
              
              // Update booking payment summary (reverse the payment)
              updateBookingPaymentSummary(receipt.reference_id, (err4) => {
                if (err4) console.error('Error updating booking summary:', err4);
                
                // Update customer balance (add back the amount)
                updateCustomerBalance(booking.customer_id, (err5) => {
                  if (err5) console.error('Error updating customer balance:', err5);
                  
                  // Reverse owner earnings
                  updateOwnerAndCompanyEarnings(receipt.reference_id, -amount, (err6) => {
                    if (err6) console.error('Error updating owner earnings:', err6);
                    
                    // Delete the receipt
                    deleteReceiptOnly(id, receipt, res);
                  });
                });
              });
            }
          );
        }
      );
    } else {
      // Non-booking receipt
      if (receipt.customer_id) {
        // Reverse the balance update
        db.query(
          `UPDATE customers SET balance = balance + ? WHERE id=?`,
          [amount, receipt.customer_id],
          (err2) => {
            if (err2) console.error('Error updating customer balance:', err2);
            deleteReceiptOnly(id, receipt, res);
          }
        );
      } else {
        deleteReceiptOnly(id, receipt, res);
      }
    }
  });
};

// Helper function to delete receipt
const deleteReceiptOnly = (id, receipt, res) => {
  db.query(`DELETE FROM cash_receipts WHERE id=?`, [id], (err) => {
    if (err) return res.status(500).json({ error: err.message });
    
    // Add ledger entry for deletion
    addLedgerEntry({
      entry_type: "receipt_deleted",
      reference_id: id,
      reference_table: "cash_receipts",
      customer_id: receipt.customer_id,
      amount: receipt.amount,
      description: `Receipt deleted - Amount: ${receipt.amount}`
    });
    
    res.json({
      success: true,
      message: "Receipt deleted successfully"
    });
  });
};

// In your cashReceiptsController.js
export const getReceiptReport = (req, res) => {
  console.log("Fetching receipt report...");
  
  const { start_date, end_date } = req.query;
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const offset = (page - 1) * limit;
  
  let query = `
    SELECT 
      cr.*,
      c.name as customer_name,
      DATE(cr.created_at) as receipt_date
    FROM cash_receipts cr
    LEFT JOIN customers c ON cr.customer_id = c.id
  `;
  
  let countQuery = `
    SELECT COUNT(*) as total
    FROM cash_receipts cr
    LEFT JOIN customers c ON cr.customer_id = c.id
  `;
  
  const params = [];
  
  // Add date filter if provided
  if (start_date && end_date) {
    const whereClause = ` WHERE DATE(cr.created_at) BETWEEN ? AND ?`;
    query += whereClause;
    countQuery += whereClause;
    params.push(start_date, end_date);
  }
  
  query += ` ORDER BY cr.created_at DESC LIMIT ? OFFSET ?`;
  
  // Get total count
  db.query(countQuery, params.slice(0, 2), (err, countResult) => {
    if (err) {
      console.error('Error fetching count:', err);
      return res.status(500).json({ error: err.message });
    }
    
    const total = countResult[0]?.total || 0;
    
    // Get paginated data
    db.query(query, [...params, limit, offset], (err, rows) => {
      if (err) {
        console.error('Error fetching receipt report:', err);
        return res.status(500).json({ error: err.message });
      }
      
      // Return in the format expected by useFetch
      res.json({
        data: rows,
        total: total,
        page: page,
        limit: limit
      });
    });
  });
};

// In your cashReceiptsController.js

export const getReceiptReportData = (req, res) => {
  console.log("Fetching raw receipt report data...");
  
  const { start_date, end_date } = req.query;
  
  let query = `
    SELECT 
      cr.*,
      c.customer_name as customer_name,
      DATE(cr.created_at) as receipt_date
    FROM cash_receipts cr
    LEFT JOIN customers c ON cr.customer_id = c.id
  `;
  
  const params = [];
  
  // Add date filter ONLY if both dates are provided
  if (start_date && end_date) {
    query += ` WHERE DATE(cr.created_at) BETWEEN ? AND ?`;
    params.push(start_date, end_date);
  }
  
  query += ` ORDER BY cr.created_at DESC`;
  
  db.query(query, params, (err, rows) => {
    if (err) {
      console.error('Error fetching receipt report:', err);
      return res.status(500).json({ error: err.message });
    }
    res.json(rows);
  });
};

// If you want to support single date or optional dates with more flexibility
export const getReceiptReportDataFlexible = (req, res) => {
  console.log("Fetching raw receipt report data with flexible date filtering...");
  
  const { start_date, end_date } = req.query;
  
  let query = `
    SELECT 
      cr.*,
      c.name as customer_name,
      DATE(cr.created_at) as receipt_date
    FROM cash_receipts cr
    LEFT JOIN customers c ON cr.customer_id = c.id
  `;
  
  const conditions = [];
  const params = [];
  
  // Handle different date scenarios
  if (start_date && end_date) {
    // Both dates provided - date range
    conditions.push(`DATE(cr.created_at) BETWEEN ? AND ?`);
    params.push(start_date, end_date);
  } else if (start_date) {
    // Only start date provided - from start date onwards
    conditions.push(`DATE(cr.created_at) >= ?`);
    params.push(start_date);
  } else if (end_date) {
    // Only end date provided - up to end date
    conditions.push(`DATE(cr.created_at) <= ?`);
    params.push(end_date);
  }
  
  // Add WHERE clause if there are conditions
  if (conditions.length > 0) {
    query += ` WHERE ` + conditions.join(' AND ');
  }
  
  query += ` ORDER BY cr.created_at DESC`;
  
  db.query(query, params, (err, rows) => {
    if (err) {
      console.error('Error fetching receipt report:', err);
      return res.status(500).json({ error: err.message });
    }
    res.json(rows);
  });
};

// Alternative: Get receipts by specific date range
export const getReceiptsByDateRange = (req, res) => {
  const { from, to } = req.query;
  
  if (!from || !to) {
    return res.status(400).json({ message: "From and To dates are required" });
  }
  
  const query = `
    SELECT 
      cr.*,
      c.name as customer_name,
      DATE(cr.created_at) as receipt_date
    FROM cash_receipts cr
    LEFT JOIN customers c ON cr.customer_id = c.id
    WHERE DATE(cr.created_at) BETWEEN ? AND ?
    ORDER BY cr.created_at DESC
  `;
  
  db.query(query, [from, to], (err, rows) => {
    if (err) {
      console.error('Error fetching receipts by date range:', err);
      return res.status(500).json({ error: err.message });
    }
    res.json(rows);
  });
};

// Get summary statistics for dashboard
export const getReceiptSummary = (req, res) => {
  const { start_date, end_date } = req.query;
  
  let query = `
    SELECT 
      COUNT(*) as total_count,
      SUM(amount) as total_amount,
      SUM(CASE WHEN payment_method = 'cash' THEN amount ELSE 0 END) as cash_total,
      SUM(CASE WHEN payment_method = 'bank' THEN amount ELSE 0 END) as bank_total,
      SUM(CASE WHEN payment_method = 'easypaisa' THEN amount ELSE 0 END) as easypaisa_total,
      SUM(CASE WHEN payment_method = 'jazzcash' THEN amount ELSE 0 END) as jazzcash_total,
      AVG(amount) as average_amount
    FROM cash_receipts cr
  `;
  
  const params = [];
  
  if (start_date && end_date) {
    query += ` WHERE DATE(cr.created_at) BETWEEN ? AND ?`;
    params.push(start_date, end_date);
  }
  
  db.query(query, params, (err, rows) => {
    if (err) {
      console.error('Error fetching receipt summary:', err);
      return res.status(500).json({ error: err.message });
    }
    res.json(rows[0]);
  });
};

// Get grouped receipts by date
export const getReceiptsGrouped = (req, res) => {
  const { start_date, end_date, group_by = 'day' } = req.query;
  
  let dateFormat;
  switch(group_by) {
    case 'week':
      dateFormat = 'YEARWEEK(created_at)';
      break;
    case 'month':
      dateFormat = 'DATE_FORMAT(created_at, "%Y-%m")';
      break;
    default: // day
      dateFormat = 'DATE(created_at)';
  }
  
  const query = `
    SELECT 
      ${dateFormat} as period,
      COUNT(*) as count,
      SUM(amount) as total,
      SUM(CASE WHEN payment_method = 'cash' THEN amount ELSE 0 END) as cash_total,
      SUM(CASE WHEN payment_method = 'bank' THEN amount ELSE 0 END) as bank_total,
      SUM(CASE WHEN payment_method = 'easypaisa' THEN amount ELSE 0 END) as easypaisa_total,
      SUM(CASE WHEN payment_method = 'jazzcash' THEN amount ELSE 0 END) as jazzcash_total,
      MIN(DATE(created_at)) as period_start
    FROM cash_receipts cr
    WHERE DATE(created_at) BETWEEN ? AND ?
    GROUP BY period
    ORDER BY period_start ASC
  `;
  
  db.query(query, [start_date, end_date], (err, rows) => {
    if (err) {
      console.error('Error fetching grouped receipts:', err);
      return res.status(500).json({ error: err.message });
    }
    res.json(rows);
  });
};