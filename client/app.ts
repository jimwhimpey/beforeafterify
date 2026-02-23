// ── Types ────────────────────────────────────────────────────────────────────

interface LabelConfig {
  text: string;
  x: number; // top-left x in original image pixels
  y: number; // top-left y in original image pixels
  fontSize: number;
  color: string;
  backgroundColor: string;
  padding: number;
}

interface ImageState {
  file: File | null;
  img: HTMLImageElement | null;
}

interface DragState {
  which: 1 | 2;
  offsetX: number; // click offset from label.x (in canvas pixels)
  offsetY: number; // click offset from label.y (in canvas pixels)
}

interface LabelBounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const PREVIEW_MAX_WIDTH = 560;
const PREVIEW_MAX_HEIGHT = 420;

// ── App State ─────────────────────────────────────────────────────────────────

const state = {
  image1: { file: null, img: null } as ImageState,
  image2: { file: null, img: null } as ImageState,
  label1: {
    text: 'Before',
    x: 10,
    y: 10,
    fontSize: 32,
    color: '#ffffff',
    backgroundColor: '#000000',
    padding: 8,
  } as LabelConfig,
  label2: {
    text: 'After',
    x: 10,
    y: 10,
    fontSize: 32,
    color: '#ffffff',
    backgroundColor: '#000000',
    padding: 8,
  } as LabelConfig,
  drag: null as DragState | null,
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function getPreviewScale(img: HTMLImageElement): number {
  const sx = PREVIEW_MAX_WIDTH / img.naturalWidth;
  const sy = PREVIEW_MAX_HEIGHT / img.naturalHeight;
  return Math.min(sx, sy, 1); // never upscale
}

function getLabelBounds(
  label: LabelConfig,
  scale: number,
  ctx: CanvasRenderingContext2D
): LabelBounds {
  ctx.font = `bold ${label.fontSize * scale}px sans-serif`;
  const tw = ctx.measureText(label.text).width;
  const th = label.fontSize * scale;
  const p = label.padding * scale;
  const lx = label.x * scale;
  const ly = label.y * scale;
  return {
    left: lx - p,
    top: ly - p,
    right: lx + tw + p,
    bottom: ly + th + p,
  };
}

function hitTest(mx: number, my: number, b: LabelBounds): boolean {
  return mx >= b.left && mx <= b.right && my >= b.top && my <= b.bottom;
}

// ── Drawing ───────────────────────────────────────────────────────────────────

function drawPreview(
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement | null,
  label: LabelConfig
): void {
  if (!img) {
    canvas.width = PREVIEW_MAX_WIDTH;
    canvas.height = Math.round(PREVIEW_MAX_HEIGHT * 0.6);
    ctx.fillStyle = '#e8e8e8';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#aaa';
    ctx.font = '15px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Click or drop an image here', canvas.width / 2, canvas.height / 2);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    return;
  }

  const scale = getPreviewScale(img);
  const w = Math.round(img.naturalWidth * scale);
  const h = Math.round(img.naturalHeight * scale);

  canvas.width = w;
  canvas.height = h;

  ctx.drawImage(img, 0, 0, w, h);

  // Draw label
  const sf = label.fontSize * scale;
  const p = label.padding * scale;
  ctx.save();
  ctx.font = `bold ${sf}px sans-serif`;
  ctx.textBaseline = 'top';
  const tw = ctx.measureText(label.text).width;
  const lx = label.x * scale;
  const ly = label.y * scale;

  ctx.fillStyle = label.backgroundColor;
  ctx.fillRect(lx - p, ly - p, tw + p * 2, sf + p * 2);

  ctx.fillStyle = label.color;
  ctx.fillText(label.text, lx, ly);

  // Subtle drag-handle outline
  ctx.strokeStyle = 'rgba(255,255,255,0.6)';
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 3]);
  ctx.strokeRect(lx - p, ly - p, tw + p * 2, sf + p * 2);
  ctx.setLineDash([]);

  ctx.restore();
}

// ── Position display ──────────────────────────────────────────────────────────

function updatePositionDisplay(which: 1 | 2): void {
  const label = which === 1 ? state.label1 : state.label2;
  const xEl = document.getElementById(`label${which}X`);
  const yEl = document.getElementById(`label${which}Y`);
  if (xEl) xEl.textContent = Math.round(label.x).toString();
  if (yEl) yEl.textContent = Math.round(label.y).toString();
}

// ── Canvas interaction ────────────────────────────────────────────────────────

function setupCanvas(
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  which: 1 | 2
): void {
  const getImg = () => (which === 1 ? state.image1.img : state.image2.img);
  const getLabel = () => (which === 1 ? state.label1 : state.label2);
  const setLabel = (l: LabelConfig) => {
    if (which === 1) state.label1 = l;
    else state.label2 = l;
  };
  const redraw = () => drawPreview(canvas, ctx, getImg(), getLabel());

  canvas.addEventListener('mousedown', (e: MouseEvent) => {
    const img = getImg();
    if (!img) return;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const scale = getPreviewScale(img);
    const bounds = getLabelBounds(getLabel(), scale, ctx);
    if (hitTest(mx, my, bounds)) {
      const label = getLabel();
      state.drag = {
        which,
        offsetX: mx - label.x * scale,
        offsetY: my - label.y * scale,
      };
      canvas.style.cursor = 'grabbing';
      e.preventDefault();
    }
  });

  canvas.addEventListener('mousemove', (e: MouseEvent) => {
    const img = getImg();
    if (!img) return;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const scale = getPreviewScale(img);

    if (state.drag?.which === which) {
      const newX = (mx - state.drag.offsetX) / scale;
      const newY = (my - state.drag.offsetY) / scale;
      setLabel({ ...getLabel(), x: newX, y: newY });
      updatePositionDisplay(which);
      redraw();
    } else {
      const bounds = getLabelBounds(getLabel(), scale, ctx);
      canvas.style.cursor = hitTest(mx, my, bounds) ? 'grab' : 'default';
    }
  });

  const stopDrag = () => {
    if (state.drag?.which === which) {
      state.drag = null;
      canvas.style.cursor = 'default';
    }
  };

  canvas.addEventListener('mouseup', stopDrag);
  canvas.addEventListener('mouseleave', stopDrag);
}

// ── File upload ───────────────────────────────────────────────────────────────

function loadImageFile(file: File, which: 1 | 2): void {
  const reader = new FileReader();
  reader.onload = (e) => {
    const dataUrl = e.target?.result as string;
    const img = new Image();
    img.onload = () => {
      if (which === 1) {
        state.image1 = { file, img };
        const canvas = document.getElementById('preview1') as HTMLCanvasElement;
        drawPreview(canvas, canvas.getContext('2d')!, img, state.label1);
      } else {
        state.image2 = { file, img };
        const canvas = document.getElementById('preview2') as HTMLCanvasElement;
        drawPreview(canvas, canvas.getContext('2d')!, img, state.label2);
      }
      checkSizeMatch();
    };
    img.src = dataUrl;
  };
  reader.readAsDataURL(file);
}

function setupUploadArea(areaId: string, inputId: string, which: 1 | 2): void {
  const area = document.getElementById(areaId)!;
  const input = document.getElementById(inputId) as HTMLInputElement;

  area.addEventListener('click', () => input.click());

  area.addEventListener('dragover', (e: DragEvent) => {
    e.preventDefault();
    area.classList.add('drag-over');
  });
  area.addEventListener('dragleave', () => area.classList.remove('drag-over'));
  area.addEventListener('drop', (e: DragEvent) => {
    e.preventDefault();
    area.classList.remove('drag-over');
    const file = e.dataTransfer?.files[0];
    if (file && file.type.startsWith('image/')) loadImageFile(file, which);
  });

  input.addEventListener('change', () => {
    const file = input.files?.[0];
    if (file) loadImageFile(file, which);
  });
}

// ── Size mismatch warning ─────────────────────────────────────────────────────

function checkSizeMatch(): void {
  const i1 = state.image1.img;
  const i2 = state.image2.img;
  const el = document.getElementById('sizeWarning')!;
  if (i1 && i2 && (i1.naturalWidth !== i2.naturalWidth || i1.naturalHeight !== i2.naturalHeight)) {
    el.textContent = `Size mismatch: Image 1 is ${i1.naturalWidth}×${i1.naturalHeight} but Image 2 is ${i2.naturalWidth}×${i2.naturalHeight}. The server will reject mismatched sizes.`;
    el.style.display = 'block';
  } else {
    el.style.display = 'none';
  }
}

// ── Label controls ────────────────────────────────────────────────────────────

function setupLabelControls(which: 1 | 2): void {
  const getLabel = () => (which === 1 ? state.label1 : state.label2);
  const setLabel = (l: LabelConfig) => {
    if (which === 1) state.label1 = l;
    else state.label2 = l;
  };
  const getImg = () => (which === 1 ? state.image1.img : state.image2.img);
  const canvas = document.getElementById(`preview${which}`) as HTMLCanvasElement;
  const ctx = canvas.getContext('2d')!;
  const redraw = () => drawPreview(canvas, ctx, getImg(), getLabel());

  const bind = (id: string, apply: (val: string, l: LabelConfig) => LabelConfig) => {
    const el = document.getElementById(id) as HTMLInputElement;
    el?.addEventListener('input', () => {
      setLabel(apply(el.value, getLabel()));
      redraw();
    });
  };

  bind(`label${which}Text`, (v, l) => ({ ...l, text: v }));
  bind(`label${which}Color`, (v, l) => ({ ...l, color: v }));
  bind(`label${which}Bg`, (v, l) => ({ ...l, backgroundColor: v }));
  bind(`label${which}Size`, (v, l) => ({
    ...l,
    fontSize: Math.max(8, Math.min(200, parseInt(v, 10) || 32)),
  }));
}

// ── GIF generation ────────────────────────────────────────────────────────────

async function generateGif(): Promise<void> {
  if (!state.image1.file || !state.image2.file) {
    showError('Please upload both images before generating.');
    return;
  }

  const btn = document.getElementById('generateBtn') as HTMLButtonElement;
  const spinner = document.getElementById('spinner')!;
  btn.disabled = true;
  btn.textContent = 'Generating…';
  spinner.style.display = 'inline-block';
  hideError();

  try {
    const fd = new FormData();
    fd.append('image1', state.image1.file);
    fd.append('image2', state.image2.file);
    fd.append('label1', JSON.stringify(state.label1));
    fd.append('label2', JSON.stringify(state.label2));

    const resp = await fetch('/api/generate', { method: 'POST', body: fd });

    if (!resp.ok) {
      const body = (await resp.json()) as { error: string };
      throw new Error(body.error ?? 'Server error');
    }

    const blob = await resp.blob();
    const url = URL.createObjectURL(blob);

    const resultSection = document.getElementById('result')!;
    const resultImg = document.getElementById('resultGif') as HTMLImageElement;
    const dlLink = document.getElementById('downloadLink') as HTMLAnchorElement;

    resultImg.src = url;
    dlLink.href = url;
    dlLink.download = 'comparison.gif';
    resultSection.style.display = 'block';
    resultSection.scrollIntoView({ behavior: 'smooth' });
  } catch (err) {
    showError(err instanceof Error ? err.message : 'Unknown error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Generate GIF';
    spinner.style.display = 'none';
  }
}

function showError(msg: string): void {
  const el = document.getElementById('errorMsg')!;
  el.textContent = msg;
  el.style.display = 'block';
}

function hideError(): void {
  const el = document.getElementById('errorMsg')!;
  el.style.display = 'none';
}

// ── Init ──────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  const canvas1 = document.getElementById('preview1') as HTMLCanvasElement;
  const canvas2 = document.getElementById('preview2') as HTMLCanvasElement;
  const ctx1 = canvas1.getContext('2d')!;
  const ctx2 = canvas2.getContext('2d')!;

  // Draw placeholders
  drawPreview(canvas1, ctx1, null, state.label1);
  drawPreview(canvas2, ctx2, null, state.label2);

  // Drag-to-reposition labels
  setupCanvas(canvas1, ctx1, 1);
  setupCanvas(canvas2, ctx2, 2);

  // File upload
  setupUploadArea('uploadArea1', 'fileInput1', 1);
  setupUploadArea('uploadArea2', 'fileInput2', 2);

  // Label settings panels
  setupLabelControls(1);
  setupLabelControls(2);

  // Generate button
  document.getElementById('generateBtn')!.addEventListener('click', () => {
    void generateGif();
  });
});
