import express, { Request, Response } from 'express';
import multer from 'multer';
import { createCanvas, loadImage, GlobalFonts } from '@napi-rs/canvas';
import GifEncoder from 'gif-encoder-2';
import path from 'path';
import fs from 'fs';
import os from 'os';
import type { CanvasExtend, LabelConfig, TextExtents } from './types';

const FONT_PATH = path.join(__dirname, '../fonts/OperatorMono-Bold.otf');
GlobalFonts.register(fs.readFileSync(FONT_PATH), 'OperatorMonoBold');

const LABEL_CORNER_RADIUS = 12; // in canvas pixels
const CANVAS_BACKGROUND = '#ffffff';
const NO_EXTEND: CanvasExtend = { top: 0, right: 0, bottom: 0, left: 0 };

const UPLOAD_DIR = path.join(os.tmpdir(), 'beforeafterify-uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const app = express();
const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (req, file, cb) => {
      cb(null, `${Date.now()}-${file.fieldname}${path.extname(file.originalname)}`);
    },
  }),
  limits: { fileSize: 50 * 1024 * 1024 },
});

app.use(express.static(path.join(__dirname, '../public')));
app.use('/uploads', express.static(UPLOAD_DIR));
app.get('/fonts/operator-mono-bold.otf', (_req, res) => {
  res.sendFile(FONT_PATH);
});
app.use(express.json());

/** Minimal interface for canvas 2D context operations we need */
interface DrawContext {
  font: string;
  textBaseline: string;
  fillStyle: string;
  globalAlpha: number;
  save(): void;
  restore(): void;
  measureText(text: string): { width: number; actualBoundingBoxAscent: number; actualBoundingBoxDescent: number };
  fillRect(x: number, y: number, w: number, h: number): void;
  beginPath(): void;
  moveTo(x: number, y: number): void;
  arcTo(x1: number, y1: number, x2: number, y2: number, radius: number): void;
  closePath(): void;
  fill(): void;
  fillText(text: string, x: number, y: number): void;
  drawImage(image: unknown, dx: number, dy: number, dw?: number, dh?: number): void;
  getImageData(sx: number, sy: number, sw: number, sh: number): { data: Uint8ClampedArray };
}

function parseExtend(raw: unknown): CanvasExtend {
  if (typeof raw !== 'string') return NO_EXTEND;
  try {
    const parsed = JSON.parse(raw) as Partial<Record<keyof CanvasExtend, unknown>>;
    const side = (v: unknown) => Math.max(0, Math.round(Number(v) || 0));
    return {
      top: side(parsed.top),
      right: side(parsed.right),
      bottom: side(parsed.bottom),
      left: side(parsed.left),
    };
  } catch {
    return NO_EXTEND;
  }
}

/** Traces a rounded rectangle, clamping the radius to what the box can fit. */
function roundedRectPath(
  ctx: DrawContext,
  x: number,
  y: number,
  w: number,
  h: number,
  radius: number
): void {
  const r = Math.min(radius, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Text extents of a label at output scale, in canvas pixels. */
function measureLabelText(ctx: DrawContext, label: LabelConfig, scale: number): TextExtents {
  ctx.font = `${label.fontSize * scale}px OperatorMonoBold`;
  const m = ctx.measureText(label.text);
  return { width: m.width, height: m.actualBoundingBoxAscent + m.actualBoundingBoxDescent };
}

/**
 * Both frames share `box` — the extents of the widest and tallest of the two
 * labels — so the chips stay identical between frames, with each label's text
 * centred inside.
 */
function drawLabel(
  ctx: DrawContext,
  label: LabelConfig,
  canvasWidth: number,
  canvasHeight: number,
  scale: number,
  box: TextExtents
): void {
  const { text, color, backgroundColor, backgroundOpacity } = label;
  const fontSize = label.fontSize * scale;
  const x = label.x * scale;
  const y = label.y * scale;
  const padding = label.padding * scale;
  const radius = LABEL_CORNER_RADIUS * scale;

  ctx.save();
  ctx.font = `${fontSize}px OperatorMonoBold`;
  ctx.textBaseline = 'alphabetic';

  const metrics = ctx.measureText(text);
  const textWidth = metrics.width;
  const ascent = metrics.actualBoundingBoxAscent;
  const textHeight = ascent + metrics.actualBoundingBoxDescent;

  // Clamp to keep the chip inside the canvas (y = top of the chip's text area)
  const clampedX = Math.max(0, Math.min(x, canvasWidth - box.width - padding * 2));
  const clampedY = Math.max(0, Math.min(y, canvasHeight - box.height - padding * 2));

  // Background (with opacity)
  ctx.globalAlpha = backgroundOpacity ?? 1;
  ctx.fillStyle = backgroundColor;
  roundedRectPath(
    ctx,
    clampedX - padding,
    clampedY - padding,
    box.width + padding * 2,
    box.height + padding * 2,
    radius
  );
  ctx.fill();

  // Text (always fully opaque), centred in the shared chip
  ctx.globalAlpha = 1;
  ctx.fillStyle = color;
  ctx.fillText(
    text,
    clampedX + (box.width - textWidth) / 2,
    clampedY + (box.height - textHeight) / 2 + ascent
  );

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

      const img1 = await loadImage(files.image1[0].path);
      const img2 = await loadImage(files.image2[0].path);

      if (img1.width !== img2.width || img1.height !== img2.height) {
        res.status(400).json({
          error: `Images must be the same size. Got ${img1.width}x${img1.height} and ${img2.width}x${img2.height}`,
        });
        return;
      }

      const extend = parseExtend(req.body.extend);
      const { width, height } = img1;
      const scale = 0.5;
      const gifWidth = Math.round((width + extend.left + extend.right) * scale);
      const gifHeight = Math.round((height + extend.top + extend.bottom) * scale);
      const imageWidth = Math.round(width * scale);
      const imageHeight = Math.round(height * scale);
      const imageX = Math.round(extend.left * scale);
      const imageY = Math.round(extend.top * scale);

      const measureCtx = createCanvas(1, 1).getContext('2d') as unknown as DrawContext;
      const extents1 = measureLabelText(measureCtx, label1, scale);
      const extents2 = measureLabelText(measureCtx, label2, scale);
      const box: TextExtents = {
        width: Math.max(extents1.width, extents2.width),
        height: Math.max(extents1.height, extents2.height),
      };

      const drawFrame = (image: unknown, label: LabelConfig): DrawContext => {
        const canvas = createCanvas(gifWidth, gifHeight);
        const ctx = canvas.getContext('2d') as unknown as DrawContext;
        ctx.fillStyle = CANVAS_BACKGROUND;
        ctx.fillRect(0, 0, gifWidth, gifHeight);
        ctx.drawImage(image, imageX, imageY, imageWidth, imageHeight);
        drawLabel(ctx, label, gifWidth, gifHeight, scale, box);
        return ctx;
      };

      const ctx1 = drawFrame(img1, label1);
      const ctx2 = drawFrame(img2, label2);

      // Encode animated GIF at 50% size — quality 1 = best colour fidelity
      const delay = Math.max(100, parseInt(req.body.delay as string, 10) || 1000);
      const encoder = new GifEncoder(gifWidth, gifHeight);
      encoder.setDelay(delay);
      encoder.setRepeat(0);
      encoder.setQuality(1);
      encoder.start();
      encoder.addFrame(ctx1.getImageData(0, 0, gifWidth, gifHeight).data);
      encoder.addFrame(ctx2.getImageData(0, 0, gifWidth, gifHeight).data);
      encoder.finish();

      const gifBuffer = encoder.out.getData();
      const gifFilename = `${Date.now()}-comparison.gif`;
      const gifPath = path.join(UPLOAD_DIR, gifFilename);
      fs.writeFileSync(gifPath, Buffer.from(gifBuffer));

      res.json({
        gifUrl: `/uploads/${gifFilename}`,
        image1Url: `/uploads/${files.image1[0].filename}`,
        image2Url: `/uploads/${files.image2[0].filename}`,
      });
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
