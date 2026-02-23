import express, { Request, Response } from 'express';
import multer from 'multer';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import GifEncoder from 'gif-encoder-2';
import path from 'path';
import type { LabelConfig } from './types';

const app = express();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
});

app.use(express.static(path.join(__dirname, '../public')));
app.use(express.json());

/** Minimal interface for canvas 2D context operations we need */
interface DrawContext {
  font: string;
  textBaseline: string;
  fillStyle: string;
  save(): void;
  restore(): void;
  measureText(text: string): { width: number };
  fillRect(x: number, y: number, w: number, h: number): void;
  fillText(text: string, x: number, y: number): void;
  drawImage(image: unknown, dx: number, dy: number): void;
  getImageData(sx: number, sy: number, sw: number, sh: number): { data: Uint8ClampedArray };
}

function drawLabel(
  ctx: DrawContext,
  label: LabelConfig,
  canvasWidth: number,
  canvasHeight: number
): void {
  const { text, x, y, fontSize, color, backgroundColor, padding } = label;

  ctx.save();
  ctx.font = `bold ${fontSize}px sans-serif`;
  ctx.textBaseline = 'top';

  const metrics = ctx.measureText(text);
  const textWidth = metrics.width;
  const textHeight = fontSize;

  // Clamp to keep label inside canvas
  const clampedX = Math.max(0, Math.min(x, canvasWidth - textWidth - padding * 2));
  const clampedY = Math.max(0, Math.min(y, canvasHeight - textHeight - padding * 2));

  // Background
  ctx.fillStyle = backgroundColor;
  ctx.fillRect(clampedX - padding, clampedY - padding, textWidth + padding * 2, textHeight + padding * 2);

  // Text
  ctx.fillStyle = color;
  ctx.fillText(text, clampedX, clampedY);

  ctx.restore();
}

app.post(
  '/api/generate',
  upload.fields([
    { name: 'image1', maxCount: 1 },
    { name: 'image2', maxCount: 1 },
  ]),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;

      if (!files?.image1?.[0] || !files?.image2?.[0]) {
        res.status(400).json({ error: 'Both images are required' });
        return;
      }

      let label1: LabelConfig;
      let label2: LabelConfig;

      try {
        label1 = JSON.parse(req.body.label1 as string) as LabelConfig;
        label2 = JSON.parse(req.body.label2 as string) as LabelConfig;
      } catch {
        res.status(400).json({ error: 'Invalid label configuration' });
        return;
      }

      const img1 = await loadImage(files.image1[0].buffer);
      const img2 = await loadImage(files.image2[0].buffer);

      if (img1.width !== img2.width || img1.height !== img2.height) {
        res.status(400).json({
          error: `Images must be the same size. Got ${img1.width}x${img1.height} and ${img2.width}x${img2.height}`,
        });
        return;
      }

      const { width, height } = img1;

      // Build frame 1
      const canvas1 = createCanvas(width, height);
      const ctx1 = canvas1.getContext('2d') as unknown as DrawContext;
      ctx1.drawImage(img1, 0, 0);
      drawLabel(ctx1, label1, width, height);

      // Build frame 2
      const canvas2 = createCanvas(width, height);
      const ctx2 = canvas2.getContext('2d') as unknown as DrawContext;
      ctx2.drawImage(img2, 0, 0);
      drawLabel(ctx2, label2, width, height);

      // Encode animated GIF
      const encoder = new GifEncoder(width, height);
      encoder.setDelay(500);
      encoder.setRepeat(0);
      encoder.start();
      encoder.addFrame(ctx1.getImageData(0, 0, width, height).data);
      encoder.addFrame(ctx2.getImageData(0, 0, width, height).data);
      encoder.finish();

      const gifBuffer = encoder.out.getData();

      res.setHeader('Content-Type', 'image/gif');
      res.setHeader('Content-Disposition', 'attachment; filename="comparison.gif"');
      res.setHeader('Content-Length', gifBuffer.length);
      res.send(gifBuffer);
    } catch (error) {
      console.error('Error generating GIF:', error);
      res.status(500).json({ error: 'Failed to generate GIF' });
    }
  }
);

const PORT = parseInt(process.env.PORT ?? '3000', 10);
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
