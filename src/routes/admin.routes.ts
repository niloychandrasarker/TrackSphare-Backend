import { Router } from 'express';
import { getDashboardSummary, getAllUsers, getAuditLogs } from '../controllers/admin.controller.js';
import { authenticate, requireAdmin } from '../middlewares/auth.middleware.js';

const router = Router();

router.use(authenticate, requireAdmin);

router.get('/summary', getDashboardSummary);
router.get('/users', getAllUsers);
router.get('/audit-logs', getAuditLogs);

export default router;
