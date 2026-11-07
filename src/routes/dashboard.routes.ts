import { Router } from 'express';
import { getDashboardSummary, getLiveLocations } from '../controllers/dashboard.controller.js';
import { authenticate } from '../middlewares/auth.middleware.js';

const router = Router();

router.get('/summary', authenticate, getDashboardSummary);
router.get('/live-locations', authenticate, getLiveLocations);

export default router;
