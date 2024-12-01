import express from 'express';
import {
  createRentReceipt,
  getAllRentReceipt,
  getRentReceiptById,
  updateRentReceipt,
  deleteRentReceipt,
} from '../controllers/rentReceipt.js';

const router = express.Router();

router.post('/', createRentReceipt);             // Create Rent Receipt
router.get('/', getAllRentReceipt);             // Get All Rent Receipts
router.get('/:id', getRentReceiptById);          // Get Rent Receipt by ID
router.put('/:id', updateRentReceipt);           // Update Rent Receipt
router.delete('/:id', deleteRentReceipt);        // Delete Rent Receipt

export default router;
