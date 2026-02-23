// ── Types ────────────────────────────────────────────────────────────────────

interface LabelConfig {
  text: string;
  x: number; // top-left x in original image pixels
  y: number; // top-left y in original image pixels
  fontSize: number;
  color: string;
  backgroundColor: string;
  backgroundOpacity: number; // 0–1
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
  delay: 1000,
  label1: {
    text: 'before',
    x: 10,
    y: 10,
    fontSize: 90,
    color: '#ffffff',
    backgroundColor: '#000000',
    backgroundOpacity: 0,
    padding: 8,
  } as LabelConfig,
  label2: {
    text: 'after',
    x: 10,
    y: 10,
    fontSize: 90,
    color: '#ffffff',
    backgroundColor: '#000000',
    backgroundOpacity: 0,
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
  ctx.font = `${label.fontSize * scale}px 'OperatorMonoBold'`;
  ctx.textBaseline = 'alphabetic';
  const m = ctx.measureText(label.text);
  const tw = m.width;
  const th = m.actualBoundingBoxAscent + m.actualBoundingBoxDescent;
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
  const p = label.padding * scale;
  ctx.save();
  ctx.font = `${label.fontSize * scale}px 'OperatorMonoBold'`;
  ctx.textBaseline = 'alphabetic';
  const m = ctx.measureText(label.text);
  const tw = m.width;
  const ascent = m.actualBoundingBoxAscent;
  const descent = m.actualBoundingBoxDescent;
  const lx = label.x * scale;
  const ly = label.y * scale;

  ctx.globalAlpha = label.backgroundOpacity;
  ctx.fillStyle = label.backgroundColor;
  ctx.fillRect(lx - p, ly - p, tw + p * 2, ascent + descent + p * 2);

  ctx.globalAlpha = 1;
  ctx.fillStyle = label.color;
  ctx.fillText(label.text, lx, ly + ascent);

  ctx.restore();
}

// ── Canvas redraw helper ──────────────────────────────────────────────────────

function redrawCanvas(which: 1 | 2): void {
  const canvas = document.getElementById(`preview${which}`) as HTMLCanvasElement;
  const ctx = canvas.getContext('2d')!;
  const img = which === 1 ? state.image1.img : state.image2.img;
  const label = which === 1 ? state.label1 : state.label2;
  drawPreview(canvas, ctx, img, label);
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
      state.label1 = { ...state.label1, x: newX, y: newY };
      state.label2 = { ...state.label2, x: newX, y: newY };
      updatePositionDisplay(1);
      updatePositionDisplay(2);
      redrawCanvas(1);
      redrawCanvas(2);
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

function setupLabelControls(): void {
  // Per-frame text inputs
  const text1El = document.getElementById('label1Text') as HTMLInputElement;
  text1El?.addEventListener('input', () => {
    state.label1 = { ...state.label1, text: text1El.value };
    redrawCanvas(1);
  });
  const text2El = document.getElementById('label2Text') as HTMLInputElement;
  text2El?.addEventListener('input', () => {
    state.label2 = { ...state.label2, text: text2El.value };
    redrawCanvas(2);
  });

  // Shared style controls
  const applyStyle = (updates: Partial<LabelConfig>) => {
    state.label1 = { ...state.label1, ...updates };
    state.label2 = { ...state.label2, ...updates };
    redrawCanvas(1);
    redrawCanvas(2);
  };
  const bind = (id: string, apply: (v: string) => Partial<LabelConfig>) => {
    const el = document.getElementById(id) as HTMLInputElement;
    el?.addEventListener('input', () => applyStyle(apply(el.value)));
  };

  bind('labelColor', (v) => ({ color: v }));
  bind('labelBg', (v) => ({ backgroundColor: v }));
  bind('labelBgOpacity', (v) => ({ backgroundOpacity: parseInt(v, 10) / 100 }));
  bind('labelSize', (v) => ({ fontSize: Math.max(8, Math.min(200, parseInt(v, 10) || 90)) }));

  // Delay
  const delayEl = document.getElementById('animDelay') as HTMLInputElement;
  delayEl?.addEventListener('input', () => {
    state.delay = Math.max(100, parseInt(delayEl.value, 10) || 1000);
  });
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
    fd.append('delay', String(state.delay));

    const resp = await fetch('/api/generate', { method: 'POST', body: fd });
    const body = await resp.json() as { error?: string; gifUrl?: string; image1Url?: string; image2Url?: string };

    if (!resp.ok) {
      throw new Error(body.error ?? 'Server error');
    }

    const { gifUrl, image1Url, image2Url } = body;

    const resultSection = document.getElementById('result')!;
    const resultImg = document.getElementById('resultGif') as HTMLImageElement;
    const dlLink = document.getElementById('downloadLink') as HTMLAnchorElement;
    const img1Link = document.getElementById('image1Link') as HTMLAnchorElement;
    const img2Link = document.getElementById('image2Link') as HTMLAnchorElement;

    resultImg.src = gifUrl!;
    dlLink.href = gifUrl!;
    dlLink.download = 'comparison.gif';
    if (img1Link && image1Url) { img1Link.href = image1Url; img1Link.style.display = 'inline-block'; }
    if (img2Link && image2Url) { img2Link.href = image2Url; img2Link.style.display = 'inline-block'; }
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

  // Draw placeholders (redraw once custom font is ready so text sizing is correct)
  drawPreview(canvas1, ctx1, null, state.label1);
  drawPreview(canvas2, ctx2, null, state.label2);
  void document.fonts.ready.then(() => {
    drawPreview(canvas1, ctx1, null, state.label1);
    drawPreview(canvas2, ctx2, null, state.label2);
  });

  // Drag-to-reposition labels
  setupCanvas(canvas1, ctx1, 1);
  setupCanvas(canvas2, ctx2, 2);

  // File upload
  setupUploadArea('uploadArea1', 'fileInput1', 1);
  setupUploadArea('uploadArea2', 'fileInput2', 2);

  // Label + animation settings
  setupLabelControls();

  // Generate button
  document.getElementById('generateBtn')!.addEventListener('click', () => {
    void generateGif();
  });
});
