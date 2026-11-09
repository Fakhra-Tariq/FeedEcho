const PLUM = '#4A1F3D';
const MASK_OCCUPIED = '#010203';
const GOLD = '#F4C95D';
const FILL_THRESHOLD = 40;
const FILLER_COPIES = 160;

export const WORD_CLOUD_BG = PLUM;

export const CLOUD_FONT_STACK =
  'Inter, system-ui, "Segoe UI", "Noto Nastaliq Urdu", "Noto Sans Arabic", "Segoe UI Historic", Tahoma, sans-serif';

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

export function cloudListSeed(items) {
  return hashString(sortCloudItems(items).map((i) => `${i.key}:${i.count}`).join('|'));
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

export function bulbMetrics(width, height) {
  const w = Math.max(1, width);
  const h = Math.max(1, height);
  const pad = Math.min(w, h) * 0.02;
  const glassH = h * 0.7;
  const R = Math.min((w - pad * 2) * 0.49, glassH * 0.5);
  const cy = pad + R;
  const cx = w / 2;
  return {
    w,
    h,
    pad,
    cx,
    cy,
    R,
    neckTop: cy + R * 0.62,
    neckBottom: h * 0.87,
    neckTopW: R * 0.28,
    neckBotW: R * 0.18,
    baseTop: h * 0.87,
    baseBottom: Math.min(h - pad, h * 0.985),
    baseW: R * 0.42,
  };
}

export function fillBulbShape(ctx, width, height) {
  const m = bulbMetrics(width, height);
  ctx.beginPath();
  ctx.arc(m.cx, m.cy, m.R, 0, Math.PI * 2);
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(m.cx - m.neckTopW, m.neckTop);
  ctx.lineTo(m.cx + m.neckTopW, m.neckTop);
  ctx.lineTo(m.cx + m.neckBotW, m.neckBottom);
  ctx.lineTo(m.cx - m.neckBotW, m.neckBottom);
  ctx.closePath();
  ctx.fill();

  const x = m.cx - m.baseW;
  const r = Math.min(8, Math.max(3, (m.baseBottom - m.baseTop) / 3));
  ctx.beginPath();
  ctx.moveTo(x + r, m.baseTop);
  ctx.lineTo(x + m.baseW * 2 - r, m.baseTop);
  ctx.quadraticCurveTo(x + m.baseW * 2, m.baseTop, x + m.baseW * 2, m.baseTop + r);
  ctx.lineTo(x + m.baseW * 2, m.baseBottom - r);
  ctx.quadraticCurveTo(x + m.baseW * 2, m.baseBottom, x + m.baseW * 2 - r, m.baseBottom);
  ctx.lineTo(x + r, m.baseBottom);
  ctx.quadraticCurveTo(x, m.baseBottom, x, m.baseBottom - r);
  ctx.lineTo(x, m.baseTop + r);
  ctx.quadraticCurveTo(x, m.baseTop, x + r, m.baseTop);
  ctx.closePath();
  ctx.fill();
}

export function paintBulbOccupancyMask(ctx, width, height, backgroundColor = PLUM) {
  ctx.save();
  ctx.fillStyle = MASK_OCCUPIED;
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = backgroundColor;
  fillBulbShape(ctx, width, height);
  ctx.restore();
}

export function clipCanvasToBulb(ctx, width, height) {
  ctx.save();
  ctx.globalCompositeOperation = 'destination-in';
  ctx.fillStyle = '#ffffff';
  fillBulbShape(ctx, width, height);
  ctx.restore();
}

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
export function buildBulbCloudLists(items) {
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
  if (real.length === 0 || real.length >= FILL_THRESHOLD) {
    return { realList, fillerList: [], realCount: real.length };
  }
  const fillerList = [];
  for (let i = 0; i < FILLER_COPIES; i += 1) {
    const item = real[i % real.length];
    const weight = 22 + (i % 6) * 2;
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
