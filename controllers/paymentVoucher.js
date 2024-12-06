import PaymentVoucher from "../models/PaymentVoucher.js";
import mongoose from "mongoose";

// Create VehicleType
export const createPaymentVoucher = async (req, res, next) => {
  try {
      // Find the latest voucherNo, sorting in descending order
      const lastVoucher = await PaymentVoucher.findOne().sort({ voucherNo: -1 });

      // Calculate the next voucherNo
      const nextVoucherNo = lastVoucher ? Number(lastVoucher.voucherNo) + 1 : 1;

      console.log("Next Voucher No:", nextVoucherNo); // Debugging output

      // Create a new PaymentVoucher with the incremented voucherNo
      const newPaymentVoucher = new PaymentVoucher({
          ...req.body,
          voucherNo: nextVoucherNo, // Assign the calculated voucherNo
      });

      // Save to the database
      const savedPaymentVoucher = await newPaymentVoucher.save();
      res.status(201).json(savedPaymentVoucher); // Respond with the new voucher
  } catch (error) {
      console.error("Error creating payment voucher:", error);
      res.status(500).json({
          message: "Failed to create payment voucher",
          error: error.message,
      });
  }
};


// Update VehicleType
export const updatePaymentVoucher = async (req, res, next) => {
  try {
    const updatedPaymentVoucher = await PaymentVoucher.findByIdAndUpdate(
      req.params.id,
      { $set: req.body },
      { new: true }
    );
    if (!updatedPaymentVoucher) {
      return res.status(404).json({ message: "VehicleType is not found" });
    }
    res.status(200).json(updatedPaymentVoucher);
  } catch (error) {
    next(error);
  }
};

// Delete VehicleType
export const deletePaymentVoucher = async (req, res, next) => {
  try {
    const deletedPaymentVoucher = await PaymentVoucher.findByIdAndDelete(req.params.id);
    if (!deletedPaymentVoucher) {
      return res.status(404).json({ message: "PaymentVoucher not found" });
    }
    res.status(200).json({ message: "Successfully deleted PaymentVoucher", deletedPaymentVoucher });
  } catch (error) {
    next(error);
  }
};

// Get a specific PaymentVoucher by ID
export const getPaymentVoucher= async (req, res, next) => {
  try {
    const tourId = req.params.id;

    // Validate if the id is a valid ObjectId
    if (!mongoose.Types.ObjectId.isValid(tourId)) {
      return res.status(400).json({ message: "Invalid ID format" });
    }

    const paymentVoucher = await PaymentVoucher.findById(tourId);
    if (!paymentVoucher) {
      return res.status(404).json({ message: "PaymentVoucher not found" });
    }

    res.status(200).json(paymentVoucher);
  } catch (error) {
    next(error);
  }
};

// Get all PaymentVoucher
export const getAllPaymentVoucher = async (req, res, next) => {
  try {
    const paymentVoucher = await PaymentVoucher.find();

    if (paymentVoucher.length === 0) {
      return res.status(200).json({ message: "No Vehicle Types found" });
    }
    res.status(200).json(paymentVoucher);
  } catch (error) {
    next(error);
  }
};
