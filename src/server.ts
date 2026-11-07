import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import authRoutes from './routes/auth.routes.js';
import deviceRoutes from './routes/device.routes.js';
import locationRoutes from './routes/location.routes.js';
import sharingRoutes from './routes/sharing.routes.js';
import consentRoutes from './routes/consent.routes.js';
import adminRoutes from './routes/admin.routes.js';
import dashboardRoutes from './routes/dashboard.routes.js';
import userRoutes from './routes/user.routes.js';
import appRoutes from './routes/app.routes.js';
import mediaRoutes from './routes/media.routes.js';
import { getAuditLogs } from './controllers/admin.controller.js';
import { authenticate } from './middlewares/auth.middleware.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps, curl, Postman)
    if (!origin) return callback(null, true);
    if (
      origin === 'http://localhost:3000' ||
      origin.includes('localhost') ||
      origin.endsWith('.vercel.app') ||
      (process.env.CLIENT_URL && origin.startsWith(process.env.CLIENT_URL))
    ) {
      return callback(null, true);
    }
    // Allow any other valid origin by default in production
    return callback(null, true);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-device-id'],
}));

app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));

// API Endpoints
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/devices', deviceRoutes);
app.use('/api/v1/locations', locationRoutes);
app.use('/api/v1/sharing', sharingRoutes);
app.use('/api/v1/consent', consentRoutes);
app.use('/api/v1/dashboard', dashboardRoutes);
app.use('/api/v1/users', userRoutes);
app.use('/api/v1/admin', adminRoutes);
app.use('/api/v1/app', appRoutes);
app.use('/api/v1/media', mediaRoutes);
app.get('/api/v1/audit-logs', authenticate, getAuditLogs);

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'TrackSphere Node.js API Server',
    database: 'Neon Serverless PostgreSQL',
    version: '1.2.0',
    timestamp: new Date().toISOString(),
  });
});

if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`🚀 TrackSphere Backend API server running on port ${PORT}`);
    console.log(`🔗 Health check available at http://localhost:${PORT}/health`);
  });
}

export default app;
