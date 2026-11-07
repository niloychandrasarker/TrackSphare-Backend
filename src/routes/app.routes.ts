import { Router } from 'express';
import { getAppDownloadInfo } from '../controllers/app.controller.js';
import { authenticate } from '../middlewares/auth.middleware.js';

const router = Router();

router.get('/info', authenticate, getAppDownloadInfo);

export default router;
