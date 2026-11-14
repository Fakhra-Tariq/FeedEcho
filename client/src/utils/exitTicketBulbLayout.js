const PLUM = '#4A1F3D';
/** Occupancy-empty / silhouette fill (wordcloud2 treats this as placeable). */
const MASK_OCCUPIED = '#010203';
const GOLD = '#F4C95D';
const FILL_THRESHOLD = 40;

export const WORD_CLOUD_BG = PLUM;
/** Opaque near-black used as the shape fill (wordcloud empty pixels). */
export const WORD_CLOUD_BULB_FILL = MASK_OCCUPIED;
export const WORD_CLOUD_SHAPE_FILL = MASK_OCCUPIED;

/**
 * Side-view brain in a 700×440 design space.
 * Must stay the single source of truth for Present-mode silhouette.
 */
export const BRAIN_SHAPE = {
  designWidth: 700,
  designHeight: 440,
  ellipses: [
    { cx: 198.8, cy: 215, rx: 69.4, ry: 62 },
    { cx: 238.0, cy: 150, rx: 73.9, ry: 66 },
    { cx: 316.4, cy: 118, rx: 76.2, ry: 68 },
    { cx: 400.4, cy: 120, rx: 76.2, ry: 68 },
    { cx: 473.2, cy: 155, rx: 73.9, ry: 66 },
    { cx: 518.0, cy: 215, rx: 69.4, ry: 62 },
    { cx: 249.2, cy: 260, rx: 71.7, ry: 64 },
    { cx: 333.2, cy: 272, rx: 73.9, ry: 66 },
    { cx: 417.2, cy: 268, rx: 69.4, ry: 62 },
    { cx: 484.4, cy: 262, rx: 58.2, ry: 52 },
    { cx: 350.0, cy: 195, rx: 106.4, ry: 95 },
    { cx: 456.4, cy: 335, rx: 80.6, ry: 40 },
  ],
  stem: {
    topLeft: { x: 366, y: 330 },
    topRight: { x: 410, y: 330 },
    bottomRight: { x: 406, y: 420 },
    bottomLeft: { x: 370, y: 420 },
    cornerRadius: 16,
  },
  origin: { x: 350, y: 195 },
};

export const CLOUD_FONT_STACK =
  'Inter, system-ui, "Segoe UI", "Noto Nastaliq Urdu", "Noto Sans Arabic", "Segoe UI Historic", Tahoma, sans-serif';

/** Axis-aligned bounds of the black silhouette in 700×440 design space. */
export function brainSilhouetteBounds() {
  let left = Infinity;
  let right = -Infinity;
  let top = Infinity;
  let bottom = -Infinity;
  BRAIN_SHAPE.ellipses.forEach((e) => {
    left = Math.min(left, e.cx - e.rx);
    right = Math.max(right, e.cx + e.rx);
    top = Math.min(top, e.cy - e.ry);
    bottom = Math.max(bottom, e.cy + e.ry);
  });
  const s = BRAIN_SHAPE.stem;
  left = Math.min(left, s.topLeft.x, s.bottomLeft.x);
  right = Math.max(right, s.topRight.x, s.bottomRight.x);
  top = Math.min(top, s.topLeft.y, s.topRight.y);
  bottom = Math.max(bottom, s.bottomLeft.y, s.bottomRight.y);
  return { left, right, top, bottom, width: right - left, height: bottom - top };
}

export function isCompactPresentViewport(viewportW, viewportH) {
  const vw = Math.max(1, viewportW);
  const vh = Math.max(1, viewportH);
  return vw < 1024 || vh < 500;
}

const hashString = (value) => {
  let h = 2166136261;
  const s = String(value || '');
  for (let i = 0; i < s.length; i += 1) {
    h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  }
  return h >>> 0;
};

export function sanitizeCloudText(value) {
  return String(value || '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function sortCloudItems(items) {
  return (Array.isArray(items) ? items : [])
    .map((item) => ({
      key: String(item.key || item.label || ''),
      label: sanitizeCloudText(item.label || item.key || ''),
      count: Math.max(1, Number(item.count) || 1),
    }))
    .filter((item) => item.label)
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

export function cloudListSeed(items, extra = '') {
  const body = sortCloudItems(items)
    .map((i) => `${i.key}:${i.count}`)
    .join('|');
  return hashString(`${extra}|${body}`);
}

export function installSeededRandom(seed) {
  const original = Math.random;
  let a = (Number(seed) || 1) >>> 0;
  Math.random = () => {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  let restored = false;
  return () => {
    if (restored) return;
    restored = true;
    Math.random = original;
  };
}

export function withSeededRandom(seed, fn) {
  const restore = installSeededRandom(seed);
  try {
    return fn();
  } finally {
    restore();
  }
}

/**
 * Fit the Present stage.
 * Desktop: 700×440 design canvas, 92% of the stage, never over 75% viewport width.
 * Phone/tablet: width-driven silhouette box (~1.24:1); height only limits if it does not fit.
 */
export function fitBrainBox(availW, availH, { viewportW = availW, viewportH = availH } = {}) {
  const dw = BRAIN_SHAPE.designWidth;
  const dh = BRAIN_SHAPE.designHeight;
  const vw = Math.max(1, viewportW);
  const vh = Math.max(1, viewportH);
  const stageW = Math.max(1, availW);
  const stageH = Math.max(1, availH);
  if (!isCompactPresentViewport(vw, vh)) {
    const fill = 0.92;
    let maxW = stageW * fill;
    const maxH = stageH * fill;
    maxW = Math.min(maxW, vw * 0.75);
    const scale = Math.min(maxW / dw, maxH / dh);
    const safe = Number.isFinite(scale) && scale > 0 ? scale : 1;
    return { width: dw * safe, height: dh * safe };
  }
  const sil = brainSilhouetteBounds();
  const aspect = sil.width / Math.max(1, sil.height);
  const landscape = vh < 500;
  if (landscape) {
    let height = stageH;
    let width = height * aspect;
    if (width > stageW) {
      width = stageW;
      height = width / aspect;
    }
    return { width, height };
  }
  let width = stageW;
  let height = width / aspect;
  if (height > stageH) {
    height = stageH;
    width = height * aspect;
  }
  return { width, height };
}

export function brainMetrics(width, height) {
  const w = Math.max(1, width);
  const h = Math.max(1, height);
  const dw = BRAIN_SHAPE.designWidth;
  const dh = BRAIN_SHAPE.designHeight;
  const sil = brainSilhouetteBounds();
  const boxAspect = w / h;
  const designAspect = dw / dh;
  const silAspect = sil.width / sil.height;
  const useSilhouette = Math.abs(boxAspect - silAspect) + 0.04 < Math.abs(boxAspect - designAspect);
  const mid = BRAIN_SHAPE.ellipses[10];
  if (useSilhouette) {
    const scale = Math.min(w / sil.width, h / sil.height);
    const drawnW = sil.width * scale;
    const drawnH = sil.height * scale;
    const ox = (w - drawnW) / 2 - sil.left * scale;
    const oy = (h - drawnH) / 2 - sil.top * scale;
    return {
      w,
      h,
      pad: 0,
      scale,
      ox,
      oy,
      drawnW,
      drawnH,
      cx: ox + BRAIN_SHAPE.origin.x * scale,
      cy: oy + BRAIN_SHAPE.origin.y * scale,
      R: mid.rx * scale,
      fit: 'silhouette',
    };
  }
  const pad = Math.min(w, h) * 0.02;
  const availW = Math.max(1, w - pad * 2);
  const availH = Math.max(1, h - pad * 2);
  const scale = Math.min(availW / dw, availH / dh);
  const drawnW = dw * scale;
  const drawnH = dh * scale;
  const ox = (w - drawnW) / 2;
  const oy = (h - drawnH) / 2;
  return {
    w,
    h,
    pad,
    scale,
    ox,
    oy,
    drawnW,
    drawnH,
    cx: ox + BRAIN_SHAPE.origin.x * scale,
    cy: oy + BRAIN_SHAPE.origin.y * scale,
    R: mid.rx * scale,
    fit: 'design',
  };
}

function fillStemPath(ctx, stem) {
  const tl = stem.topLeft;
  const tr = stem.topRight;
  const br = stem.bottomRight;
  const bl = stem.bottomLeft;
  const r = Math.min(stem.cornerRadius || 16, Math.abs(br.x - bl.x) / 2, Math.abs(br.y - tr.y) / 2);
  ctx.beginPath();
  ctx.moveTo(tl.x, tl.y);
  ctx.lineTo(tr.x, tr.y);
  ctx.lineTo(br.x, br.y - r);
  ctx.quadraticCurveTo(br.x, br.y, br.x - r, br.y);
  ctx.lineTo(bl.x + r, bl.y);
  ctx.quadraticCurveTo(bl.x, bl.y, bl.x, bl.y - r);
  ctx.closePath();
  ctx.fill();
}

export function fillBrainShape(ctx, width, height) {
  const m = brainMetrics(width, height);
  ctx.save();
  ctx.translate(m.ox, m.oy);
  ctx.scale(m.scale, m.scale);
  BRAIN_SHAPE.ellipses.forEach((e) => {
    ctx.beginPath();
    ctx.ellipse(e.cx, e.cy, e.rx, e.ry, 0, 0, Math.PI * 2);
    ctx.fill();
  });
  fillStemPath(ctx, BRAIN_SHAPE.stem);
  ctx.restore();
}

export function paintBrainOccupancyMask(
  ctx,
  width,
  height,
  emptyColor = MASK_OCCUPIED,
  occupiedColor = PLUM
) {
  ctx.save();
  ctx.fillStyle = occupiedColor;
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = emptyColor;
  fillBrainShape(ctx, width, height);
  ctx.restore();
}

export function clipCanvasToBrain(ctx, width, height) {
  const tmp = document.createElement('canvas');
  tmp.width = width;
  tmp.height = height;
  const tctx = tmp.getContext('2d');
  if (!tctx) return;
  tctx.fillStyle = '#ffffff';
  fillBrainShape(tctx, width, height);
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = 'destination-in';
  ctx.drawImage(tmp, 0, 0);
  ctx.restore();
}

/** @deprecated Use brainMetrics — Present mode is a brain, not a bulb. */
export const bulbMetrics = brainMetrics;
/** @deprecated Use fillBrainShape */
export const fillBulbShape = fillBrainShape;
/** @deprecated Use paintBrainOccupancyMask */
export const paintBulbOccupancyMask = paintBrainOccupancyMask;
/** @deprecated Use clipCanvasToBrain */
export const clipCanvasToBulb = clipCanvasToBrain;

/** Total placed items cap on compact Present brains (reals + filler). */
export const PHONE_CLOUD_CAP = 120;

export function fillerCountForArea(width, height, realCount, { compact } = {}) {
  const n = Math.max(0, realCount);
  if (n === 0 || n >= FILL_THRESHOLD) return 0;
  if (compact) {
    return Math.max(0, PHONE_CLOUD_CAP - n);
  }
  const area = Math.max(1, width) * Math.max(1, height);
  const target = Math.max(120, Math.min(250, Math.round(area / 2200)));
  return Math.max(0, target - n);
}

function pointInEllipse(px, py, e) {
  const dx = (px - e.cx) / e.rx;
  const dy = (py - e.cy) / e.ry;
  return dx * dx + dy * dy <= 1;
}

function pointInStem(px, py, stem) {
  const y0 = stem.topLeft.y;
  const y1 = stem.bottomLeft.y;
  if (py < y0 || py > y1) return false;
  const t = (py - y0) / Math.max(1, y1 - y0);
  const left = stem.topLeft.x + t * (stem.bottomLeft.x - stem.topLeft.x);
  const right = stem.topRight.x + t * (stem.bottomRight.x - stem.topRight.x);
  return px >= left && px <= right;
}

export function isPointInBrain(x, y, width, height) {
  const m = brainMetrics(width, height);
  if (m.scale <= 0) return false;
  const dx = (x - m.ox) / m.scale;
  const dy = (y - m.oy) / m.scale;
  if (BRAIN_SHAPE.ellipses.some((e) => pointInEllipse(dx, dy, e))) return true;
  return pointInStem(dx, dy, BRAIN_SHAPE.stem);
}

/** True if the axis-aligned glyph box lies inside the silhouette (edge samples). */
export function isRectInBrain(left, top, right, bottom, width, height) {
  const bw = Math.max(0, right - left);
  const bh = Math.max(0, bottom - top);
  const stepX = Math.max(3, Math.min(10, bw / 8 || 3));
  const stepY = Math.max(3, Math.min(10, bh / 4 || 3));
  for (let x = left; x <= right; x += stepX) {
    if (!isPointInBrain(x, top, width, height)) return false;
    if (!isPointInBrain(x, (top + bottom) / 2, width, height)) return false;
    if (!isPointInBrain(x, bottom, width, height)) return false;
  }
  for (let y = top; y <= bottom; y += stepY) {
    if (!isPointInBrain(left, y, width, height)) return false;
    if (!isPointInBrain((left + right) / 2, y, width, height)) return false;
    if (!isPointInBrain(right, y, width, height)) return false;
  }
  return (
    isPointInBrain(right, top, width, height) &&
    isPointInBrain(right, bottom, width, height) &&
    isPointInBrain(left, bottom, width, height)
  );
}

export function countGlyphsOutsideBrain(hits, width, height) {
  return (hits || []).filter((box) => {
    return !isRectInBrain(box.left, box.top, box.right, box.bottom, width, height);
  }).length;
}

export function presentFontRangeCss(brainCssWidth, { compact } = {}) {
  const w = Math.max(1, brainCssWidth);
  if (compact) {
    const max = Math.round(Math.min(44, Math.max(40, w * 0.118)));
    return { min: 11, max };
  }
  return {
    min: 14,
    max: Math.min(90, Math.max(64, w * 0.07)),
  };
}

function boxesOverlap(a, b, gap) {
  return !(
    a.right + gap < b.left ||
    b.right + gap < a.left ||
    a.bottom + gap < b.top ||
    b.bottom + gap < a.top
  );
}

/**
 * Place 1–4 real labels in the wide central lobes. Font shrinks until the
 * whole glyph box is inside the silhouette and at most ~70% of brain width.
 */
export function layoutSparseBrainWords(ctx, realList, { width, height, minFont, maxFont }) {
  const placed = [];
  if (!ctx || !realList?.length) return placed;
  const m = brainMetrics(width, height);
  const sil = brainSilhouetteBounds();
  const brainW = sil.width * m.scale;
  const maxWordW = brainW * 0.7;
  const gap = Math.max(6, m.scale * 4);
  const offsets = [
    [0, 0],
    [0, m.R * 0.55],
    [0, -m.R * 0.45],
    [m.R * 0.42, m.R * 0.12],
    [-m.R * 0.42, m.R * 0.12],
    [m.R * 0.28, m.R * 0.55],
    [-m.R * 0.28, m.R * 0.55],
  ];
  realList.forEach((row) => {
    const label = row[0];
    const color = row[2]?.color || '#FFFFFF';
    let fitted = null;
    for (let font = maxFont; font >= minFont && !fitted; font -= 1) {
      ctx.font = `700 ${font}px ${CLOUD_FONT_STACK}`;
      const w = ctx.measureText(label).width;
      if (w > maxWordW) continue;
      const h = font;
      for (let o = 0; o < offsets.length && !fitted; o += 1) {
        const cx = m.cx + offsets[o][0];
        const cy = m.cy + offsets[o][1];
        const box = {
          left: cx - w / 2,
          right: cx + w / 2,
          top: cy - h / 2,
          bottom: cy + h / 2,
          cx,
          cy,
          font,
          label,
          color,
        };
        if (!isRectInBrain(box.left, box.top, box.right, box.bottom, width, height)) continue;
        if (placed.some((p) => boxesOverlap(p, box, gap))) continue;
        fitted = box;
      }
    }
    if (fitted) placed.push(fitted);
  });
  return placed;
}

/** @deprecated Use isPointInBrain */
export const isPointInBulb = isPointInBrain;
/** @deprecated Use countGlyphsOutsideBrain */
export const countGlyphsOutsideBulb = countGlyphsOutsideBrain;

export function colorForCloudItem(item, rank, total) {
  if (rank < Math.min(3, total)) return GOLD;
  if (rank % 2 === 0) return '#FFFFFF';
  return '#E8C9DB';
}

const fillerTint = (index) => {
  const opacity = 0.3 + (index % 4) * 0.04;
  if (index % 3 === 1) return `rgba(232,201,219,${opacity.toFixed(2)})`;
  if (index % 3 === 2) return `rgba(201,160,184,${opacity.toFixed(2)})`;
  return `rgba(255,255,255,${opacity.toFixed(2)})`;
};

/**
 * Real items first (weights 70-100). If fewer than 40, cycle dim filler copies
 * (weights 22-32) that exist only for packing. Never use filler in counts.
 */
export function buildBulbCloudLists(
  items,
  { width = 800, height = 600, fillerScale = 1, compact = false } = {}
) {
  const real = sortCloudItems(items);
  const maxCount = real[0]?.count || 1;
  const minCount = real[real.length - 1]?.count || 1;
  const realList = real.map((item, index) => {
    const t = maxCount === minCount ? 1 : (item.count - minCount) / (maxCount - minCount);
    const weight = Math.round(70 + t * 30);
    return [
      item.label,
      weight,
      { real: true, count: item.count, color: colorForCloudItem(item, index, real.length) },
    ];
  });
  const copies = Math.round(
    fillerCountForArea(width, height, real.length, { compact }) * fillerScale
  );
  const fillerList = [];
  for (let i = 0; i < copies; i += 1) {
    const item = real[i % real.length];
    const weight = compact ? 25 + (i % 6) : 22 + (i % 6) * 2;
    fillerList.push([item.label, weight, { real: false, color: fillerTint(i) }]);
  }
  return { realList, fillerList, realCount: real.length };
}

export function toWordCloudList(items) {
  return buildBulbCloudLists(items).realList.map((row) => [
    row[0],
    row[2].count,
    row[2].count,
    row[2].color,
  ]);
}

export function tooltipForCloudItem(item) {
  if (!item) return null;
  const meta = item[2];
  if (!meta || meta.real !== true) return null;
  const n = meta.count;
  return `${item[0]}: ${n} response${n === 1 ? '' : 's'}`;
}
