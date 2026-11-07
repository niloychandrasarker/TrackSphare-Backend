import { Router } from 'express';
import {
  registerDevice,
  registerMobileDevice,
  getDevices,
  inviteViewer,
  revokeViewer,
  getViewers,
  deleteDevice,
  updateDevice,
} from '../controllers/device.controller.js';
import { authenticate, optionalAuthenticate } from '../middlewares/auth.middleware.js';

const router = Router();

router.post('/register', authenticate, registerDevice);
router.post('/register-mobile', optionalAuthenticate, registerMobileDevice);
router.get('/', authenticate, getDevices);
router.patch('/:id', optionalAuthenticate, updateDevice);
router.put('/:id', optionalAuthenticate, updateDevice);
router.delete('/:id', authenticate, deleteDevice);

router.post('/:id/viewers/invite', authenticate, inviteViewer);
router.get('/:id/viewers', authenticate, getViewers);
router.delete('/:id/viewers/:viewerId', authenticate, revokeViewer);

export default router;
