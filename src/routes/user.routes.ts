import { Router } from 'express';
import { listUsers, updateUserStatus, updateProfile } from '../controllers/user.controller.js';
import { authenticate } from '../middlewares/auth.middleware.js';

const router = Router();

router.get('/', authenticate, listUsers);
router.patch('/:id/status', authenticate, updateUserStatus);
router.patch('/profile', authenticate, updateProfile);

export default router;
