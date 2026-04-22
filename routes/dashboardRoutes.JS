import express from 'express';
import { 
  getDashboardStats, 
  getRevenueChart, 
  getTimelineEvents 
} from '../controllers/dashboardController.js';
import { protect } from '../middlewares/auth.middleware.js';

const router = express.Router();

router.get('/stats', protect, getDashboardStats);
router.get('/revenue-chart', protect, getRevenueChart);
router.get('/timeline', protect, getTimelineEvents);

export default router;