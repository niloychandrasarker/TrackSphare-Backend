import { Router } from 'express';
import { startSharing, stopSharing, getSharingStatus } from '../controllers/sharing.controller.js';
import { authenticate, optionalAuthenticate } from '../middlewares/auth.middleware.js';

const router = Router();

router.post('/start', optionalAuthenticate, startSharing);
router.post('/stop', optionalAuthenticate, stopSharing);
router.get('/status', optionalAuthenticate, getSharingStatus);

export default router;
