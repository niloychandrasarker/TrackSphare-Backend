import { Router } from 'express';
import {
  uploadLocation,
  getLatestLocation,
  getLiveLocations,
  getLocationHistory,
} from '../controllers/location.controller.js';
import { authenticate, optionalAuthenticate } from '../middlewares/auth.middleware.js';

const router = Router();

router.post('/', optionalAuthenticate, uploadLocation);
router.get('/', optionalAuthenticate, uploadLocation); // Support standard Android GPS HTTP GET protocol
router.get('/latest', authenticate, getLatestLocation);
router.get('/live', authenticate, getLiveLocations);
router.get('/history', authenticate, getLocationHistory);

export default router;
