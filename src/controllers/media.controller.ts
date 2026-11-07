import { Request, Response } from 'express';

const IMAGEKIT_PRIVATE_KEY = process.env.IMAGEKIT_PRIVATE_KEY || 'private_taV6bEgCHv+mAaqeIv9tpNMSqaM=';

export async function uploadToImageKit(req: Request, res: Response): Promise<void> {
  try {
    const { file, fileName = 'user_device.jpg', folder = '/tracksphere' } = req.body;
    if (!file) {
      res.status(400).json({ success: false, error: 'File data is required (base64 or URL)' });
      return;
    }

    const auth = Buffer.from(IMAGEKIT_PRIVATE_KEY + ':').toString('base64');
    const form = new FormData();
    form.append('file', file);
    form.append('fileName', fileName);
    form.append('folder', folder);

    const ikRes = await fetch('https://upload.imagekit.io/api/v1/files/upload', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
      },
      body: form,
    });

    const ikData = await ikRes.json();
    if (!ikRes.ok) {
      res.status(ikRes.status).json({ success: false, error: ikData.message || 'ImageKit upload failed' });
      return;
    }

    res.json({
      success: true,
      data: {
        fileId: ikData.fileId,
        url: ikData.url,
        thumbnailUrl: ikData.thumbnailUrl,
        name: ikData.name,
      },
    });
  } catch (err: any) {
    console.error('ImageKit upload error:', err);
    res.status(500).json({ success: false, error: 'Internal server error uploading image' });
  }
}
