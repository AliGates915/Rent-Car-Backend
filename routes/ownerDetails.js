import express from 'express';
import {
  createOwnerDetails,
  updateOwnerDetails,
  deleteOwnerDetails,
  getOwnerDetails,
  getAllOwnerDetails,
} from '../controllers/ownerDetails.js';

const router = express.Router();

// Create a new OwnerDetails
router.post('/', createOwnerDetails);

// Update OwnerDetails by ID
router.put('/:id', updateOwnerDetails);

// Delete OwnerDetails by ID
router.delete('/:id', deleteOwnerDetails);

// Get OwnerDetails by ID
router.get('/:id', getOwnerDetails);

// Get all OwnerDetails
router.get('/', getAllOwnerDetails);

export default router;
