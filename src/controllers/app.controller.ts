import { Response } from 'express';
import { AuthenticatedRequest } from '../middlewares/auth.middleware.js';

export async function getAppDownloadInfo(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    res.json({
      success: true,
      data: {
        appName: 'TrackSphere Android Agent',
        version: '1.2.0',
        minAndroidVersion: 'Android 10 (API 29)',
        downloadUrl: '/downloads/TrackSphere-release.apk',
        userPairingToken: req.user.sub,
        serverUrl: process.env.SERVER_URL || 'http://localhost:5000',
        instructions: [
          '1. Download and install TrackSphere APK on your Android device',
          '2. Open the app and sign in with your TrackSphere account',
          '3. Review explicit location sharing disclosure and grant location permissions',
          '4. Toggle "Enable Location Sharing" to start 30s cadence location sync',
        ],
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'Failed to retrieve app info' });
  }
}
