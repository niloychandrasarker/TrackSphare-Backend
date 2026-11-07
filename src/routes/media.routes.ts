import { Router } from 'express';
import { uploadToImageKit } from '../controllers/media.controller.js';

const router = Router();

router.post('/upload', uploadToImageKit);

export default router;
