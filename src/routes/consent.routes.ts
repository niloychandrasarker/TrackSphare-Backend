import { Router } from 'express';
import { grantConsent, revokeConsent } from '../controllers/consent.controller.js';
import { optionalAuthenticate } from '../middlewares/auth.middleware.js';

const router = Router();

router.post('/grant', optionalAuthenticate, grantConsent);
router.post('/revoke', optionalAuthenticate, revokeConsent);

export default router;
