import ExpenseVoucher from "../models/ExpenseVoucher.js";
import mongoose from "mongoose";

// Create VehicleType
export const createExpenseVoucher = async (req, res, next) => {
    try {
      // Get the last rent receipt's serial number, sorted by descending serialNo (ensure it's treated as a number)
       // Find the latest voucherNo, sorting in descending order
       const lastVoucher = await ExpenseVoucher.findOne().sort({ voucherNo: -1 });

       // Calculate the next voucherNo
       const nextVoucherNo = lastVoucher ? Number(lastVoucher.voucherNo) + 1 : 1;
 
       console.log("Next Voucher No:", nextVoucherNo); // Debugging output
 
       // Create a new PaymentVoucher with the incremented voucherNo
       const newExpenseVoucher = new ExpenseVoucher({
           ...req.body,
           voucherNo: nextVoucherNo, // Assign the calculated voucherNo
       });
      // Save to the database
      const savedExpenseVoucher = await newExpenseVoucher.save();
      res.status(201).json(savedExpenseVoucher);
    } catch (error) {
      console.error("Error creating rent receipt:", error);
      res.status(500).json({
        message: "Failed to create rent receipt",
        error: error.message,
      });
    }
  };

// Update VehicleType
export const updateExpenseVoucher = async (req, res, next) => {
  try {
    const updatedExpenseVoucher = await ExpenseVoucher.findByIdAndUpdate(
      req.params.id,
      { $set: req.body },
      { new: true }
    );
    if (!updatedExpenseVoucher) {
      return res.status(404).json({ message: "ExpenseVoucher is not found" });
    }
    res.status(200).json(updatedExpenseVoucher);
  } catch (error) {
    next(error);
  }
};

// Delete ExpenseVoucher
export const deleteExpenseVoucher = async (req, res, next) => {
  try {
    const deletedExpenseVoucher = await ExpenseVoucher.findByIdAndDelete(req.params.id);
    if (!deletedExpenseVoucher) {
      return res.status(404).json({ message: "ExpenseVoucher not found" });
    }
    res.status(200).json({ message: "Successfully deleted ExpenseVoucher", deletedExpenseVoucher });
  } catch (error) {
    next(error);
  }
};

// Get a specific ExpenseVoucher by ID
export const getExpenseVoucher = async (req, res, next) => {
  try {
    const tourId = req.params.id;

    // Validate if the id is a valid ObjectId
    if (!mongoose.Types.ObjectId.isValid(tourId)) {
      return res.status(400).json({ message: "Invalid ID format" });
    }

    const paymentVoucher = await ExpenseVoucher.findById(tourId);
    if (!paymentVoucher) {
      return res.status(404).json({ message: "PaymentVoucher not found" });
    }

    res.status(200).json(paymentVoucher);
  } catch (error) {
    next(error);
  }
};

// Get all PaymentVoucher
export const getAllExpenseVoucher = async (req, res, next) => {
  try {
    const paymentVoucher = await ExpenseVoucher.find();

    if (paymentVoucher.length === 0) {
      return res.status(200).json({ message: "No Vehicle Types found" });
    }
    res.status(200).json(paymentVoucher);
  } catch (error) {
    next(error);
  }
};
