import {
  WORD_CLOUD_BG,
  WORD_CLOUD_BULB_FILL,
  BRAIN_SHAPE,
  brainMetrics,
  fitBrainBox,
  brainSilhouetteBounds,
  isRectInBrain,
  presentFontRangeCss,
  buildBulbCloudLists,
  cloudListSeed,
  colorForCloudItem,
  fillerCountForArea,
  sanitizeCloudText,
  sortCloudItems,
  tooltipForCloudItem,
  withSeededRandom,
} from './exitTicketBulbLayout';

const REALISTIC = [
  'good',
  'very good',
  'helpful',
  'fast',
  'boring',
  'clear',
  'interesting',
  'too long',
  'engaging',
  'confusing',
  'well explained',
  'good',
  'helpful',
  'clear',
  'fast',
  'interesting',
  'needs examples',
  'perfect pace',
  'good',
  'very good',
  'loved it',
  'unclear',
  'helpful',
  'boring',
  'clear slides',
  'too fast',
  'good',
  'interesting',
  'well structured',
  'helpful',
  'good examples',
  'confusing',
  'clear',
  'very good',
  'short and sweet',
  'good',
  'fast',
  'engaging',
  'hard to follow',
  'helpful',
];

describe('sanitizeCloudText', () => {
  it('does not split words and collapses spaces', () => {
    expect(sanitizeCloudText('  abdhd  ')).toBe('abdhd');
    expect(sanitizeCloudText('whole\nanswer')).toBe('whole answer');
  });
});

describe('buildBulbCloudLists', () => {
  it('adds filler copies when there are fewer than 40 real items and never puts xN on labels', () => {
    const { realList, fillerList, realCount } = buildBulbCloudLists([
      { key: 'abdhd', label: 'abdhd', count: 1 },
      { key: 'donnn', label: 'donnn', count: 1 },
      { key: 'sheela', label: 'sheela', count: 1 },
    ]);
    expect(realCount).toBe(3);
    expect(realList).toHaveLength(3);
    expect(fillerList.length).toBeGreaterThan(40);
    realList.concat(fillerList).forEach((row) => {
      expect(String(row[0])).not.toMatch(/x\d/);
    });
    expect(fillerList.every((row) => row[2].real === false)).toBe(true);
    expect(realList.every((row) => row[2].real === true)).toBe(true);
  });

  it('uses a one-shot filler count between 120 and 250 minus reals', () => {
    const copies = fillerCountForArea(1392, 720, 3);
    expect(copies).toBeGreaterThanOrEqual(117);
    expect(copies).toBeLessThanOrEqual(247);
    expect(fillerCountForArea(800, 600, 0)).toBe(0);
    expect(fillerCountForArea(800, 600, 40)).toBe(0);
  });

  it('caps compact phones at 120 total items with smaller filler weights', () => {
    const items = [
      { key: 'a', label: 'Nice project very impressive', count: 1 },
      { key: 'b', label: 'goood', count: 1 },
      { key: 'c', label: 'Nice idea', count: 1 },
      { key: 'd', label: 'clear', count: 1 },
    ];
    const packed = buildBulbCloudLists(items, {
      width: 374,
      height: 240,
      compact: true,
    });
    expect(packed.realCount).toBe(4);
    expect(packed.fillerList).toHaveLength(116);
    expect(packed.realCount + packed.fillerList.length).toBe(120);
    packed.fillerList.forEach((row) => {
      expect(row[1]).toBeGreaterThanOrEqual(25);
      expect(row[1]).toBeLessThanOrEqual(30);
      expect(row[2].real).toBe(false);
    });
    const desk = buildBulbCloudLists(items, { width: 1392, height: 720, compact: false });
    expect(desk.fillerList.length).toBeGreaterThan(40);
    expect(desk.fillerList[0][1]).toBe(22);
    expect(fillerCountForArea(374, 240, 4, { compact: true })).toBe(116);
    expect(fillerCountForArea(1392, 720, 4)).toBe(fillerCountForArea(1392, 720, 4, { compact: false }));
  });

  it('does not add filler at 40+ real items', () => {
    const items = Array.from({ length: 40 }, (_, i) => ({
      key: `w${i}`,
      label: `w${i}`,
      count: 40 - i,
    }));
    const { fillerList, realCount } = buildBulbCloudLists(items);
    expect(realCount).toBe(40);
    expect(fillerList).toHaveLength(0);
  });

  it('cycles filler from real labels only', () => {
    const { realList, fillerList } = buildBulbCloudLists([
      { key: 'good', label: 'good', count: 2 },
    ]);
    expect(realList[0][0]).toBe('good');
    expect(fillerList.every((row) => row[0] === 'good')).toBe(true);
  });
});

describe('tooltipForCloudItem', () => {
  it('returns a count tooltip only for real words', () => {
    expect(tooltipForCloudItem(['good', 90, { real: true, count: 3 }])).toBe(
      'good: 3 responses'
    );
    expect(tooltipForCloudItem(['good', 24, { real: false }])).toBeNull();
  });
});

describe('colorForCloudItem', () => {
  it('uses gold for the top 3 by frequency', () => {
    const items = [
      { key: 'a', label: 'good', count: 9 },
      { key: 'b', label: 'clear', count: 7 },
      { key: 'c', label: 'fast', count: 5 },
    ];
    expect(colorForCloudItem(items[0], 0, 4)).toBe('#F4C95D');
    expect(colorForCloudItem(items[1], 1, 4)).toBe('#F4C95D');
    expect(colorForCloudItem(items[2], 2, 4)).toBe('#F4C95D');
  });
});

describe('cloudListSeed', () => {
  it('is stable for the same counts', () => {
    const a = [
      { key: 'good', label: 'good', count: 3 },
      { key: 'fast', label: 'fast', count: 1 },
    ];
    const b = [
      { key: 'fast', label: 'fast', count: 1 },
      { key: 'good', label: 'good', count: 3 },
    ];
    expect(cloudListSeed(a)).toBe(cloudListSeed(b));
    expect(cloudListSeed(a, 'q1')).not.toBe(cloudListSeed(a, 'q2'));
  });

  it('seeded random is deterministic', () => {
    const seq = () => withSeededRandom(42, () => [Math.random(), Math.random(), Math.random()]);
    expect(seq()).toEqual(seq());
  });
});

describe('bulb fill vs page', () => {
  it('keeps the near-black bulb fill distinct from the plum page', () => {
    expect(WORD_CLOUD_BULB_FILL).toBe('#010203');
    expect(WORD_CLOUD_BG).toBe('#4A1F3D');
    expect(WORD_CLOUD_BULB_FILL).not.toBe(WORD_CLOUD_BG);
  });
});

describe('BRAIN_SHAPE', () => {
  it('uses the specified ellipses and stem in a 700x440 space', () => {
    expect(BRAIN_SHAPE.designWidth).toBe(700);
    expect(BRAIN_SHAPE.designHeight).toBe(440);
    expect(BRAIN_SHAPE.ellipses).toEqual([
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
    ]);
    expect(BRAIN_SHAPE.stem).toEqual({
      topLeft: { x: 366, y: 330 },
      topRight: { x: 410, y: 330 },
      bottomRight: { x: 406, y: 420 },
      bottomLeft: { x: 370, y: 420 },
      cornerRadius: 16,
    });
    const contentW = 587 - 129;
    const contentH = 420 - 50;
    expect(contentW / contentH).toBeCloseTo(1.24, 1);
  });
});

describe('fitBrainBox', () => {
  it('fills about 92% of a large desktop stage and keeps aspect ratio', () => {
    const box = fitBrainBox(1800, 900, { viewportW: 1920, viewportH: 1080 });
    expect(box.height).toBeGreaterThan(700);
    expect(box.height).toBeCloseTo(900 * 0.92, 0);
    expect(box.width).toBeLessThanOrEqual(1920 * 0.75);
    expect(box.width / box.height).toBeCloseTo(700 / 440);
  });

  it('does not cap desktop width to 80% of the shorter viewport side', () => {
    const box = fitBrainBox(1400, 800, { viewportW: 1400, viewportH: 900 });
    expect(box.width).toBeGreaterThan(720);
    expect(box.width).toBeLessThanOrEqual(1400 * 0.75);
    expect(box.width / box.height).toBeCloseTo(700 / 440);
  });

  it('fits landscape phone height without overflowing', () => {
    const sil = brainSilhouetteBounds();
    const box = fitBrainBox(796, 220, { viewportW: 844, viewportH: 390 });
    expect(box.height).toBeLessThanOrEqual(220);
    expect(box.width).toBeLessThanOrEqual(796);
    expect(box.width / box.height).toBeCloseTo(sil.width / sil.height, 2);
  });

  it('uses nearly the full padded width on phone portrait', () => {
    const sil = brainSilhouetteBounds();
    const box = fitBrainBox(272, 500, { viewportW: 320, viewportH: 568 });
    expect(box.width).toBeGreaterThan(260);
    expect(box.width).toBeLessThanOrEqual(272);
    expect(box.width / box.height).toBeCloseTo(sil.width / sil.height, 2);
  });

  it('is width-driven on a 390x844 phone stage', () => {
    const sil = brainSilhouetteBounds();
    const box = fitBrainBox(374, 700, { viewportW: 390, viewportH: 844 });
    expect(box.width).toBeCloseTo(374, 0);
    expect(box.height).toBeCloseTo(374 / (sil.width / sil.height), 0);
  });

  it('is width-driven on a 360x640 phone stage', () => {
    const sil = brainSilhouetteBounds();
    const box = fitBrainBox(344, 480, { viewportW: 360, viewportH: 640 });
    expect(box.width).toBeCloseTo(344, 0);
    expect(box.height).toBeCloseTo(344 / (sil.width / sil.height), 0);
  });

  it('uses viewport minus 32px on tablet portrait stage', () => {
    const sil = brainSilhouetteBounds();
    const box = fitBrainBox(736, 900, { viewportW: 768, viewportH: 1024 });
    expect(box.width).toBeCloseTo(736, 0);
    expect(box.width / box.height).toBeCloseTo(sil.width / sil.height, 2);
  });
});

describe('presentFontRangeCss', () => {
  it('uses 11–44px on compact phone brains and keeps desktop range', () => {
    expect(presentFontRangeCss(370, { compact: true })).toEqual({ min: 11, max: 44 });
    expect(presentFontRangeCss(304, { compact: true }).min).toBe(11);
    expect(presentFontRangeCss(304, { compact: true }).max).toBeGreaterThanOrEqual(40);
    const desk = presentFontRangeCss(1200, { compact: false });
    expect(desk.min).toBe(14);
    expect(desk.max).toBeGreaterThanOrEqual(64);
  });
});

describe('brainMetrics', () => {
  it('fits the 700x440 brain in the canvas and keeps aspect ratio', () => {
    expect(BRAIN_SHAPE.designWidth / BRAIN_SHAPE.designHeight).toBeCloseTo(700 / 440);
    const m = brainMetrics(1591, 1000);
    expect(m.drawnW / m.drawnH).toBeCloseTo(700 / 440);
    expect(m.fit).toBe('design');
    expect(m.drawnW).toBeLessThanOrEqual(1591);
    expect(m.drawnH).toBeLessThanOrEqual(1000);
    expect(m.cx).toBeCloseTo(m.ox + BRAIN_SHAPE.origin.x * m.scale);
    expect(m.cy).toBeCloseTo(m.oy + BRAIN_SHAPE.origin.y * m.scale);
  });

  it('fills a silhouette-aspect canvas on compact phones', () => {
    const sil = brainSilhouetteBounds();
    const m = brainMetrics(374, 374 / (sil.width / sil.height));
    expect(m.fit).toBe('silhouette');
    expect(m.drawnW / m.drawnH).toBeCloseTo(sil.width / sil.height, 2);
  });

  it('isPointInBrain covers the middle lobe and not the corners', () => {
    const { isPointInBrain } = require('./exitTicketBulbLayout');
    const w = 700;
    const h = 440;
    const m = brainMetrics(w, h);
    expect(isPointInBrain(m.cx, m.cy, w, h)).toBe(true);
    expect(isPointInBrain(2, 2, w, h)).toBe(false);
    expect(isRectInBrain(m.cx - 4, m.cy - 4, m.cx + 4, m.cy + 4, w, h)).toBe(true);
    expect(isRectInBrain(0, 0, 20, 20, w, h)).toBe(false);
  });
});

describe('sortCloudItems', () => {
  it('does not invent or duplicate words', () => {
    const sorted = sortCloudItems([
      { key: 'good', label: 'good', count: 2 },
      { key: 'fast', label: 'fast', count: 1 },
    ]);
    expect(sorted.map((i) => i.label)).toEqual(['good', 'fast']);
  });
});

describe('wordcloud2.js', () => {
  it('loads as a function in the browser-like test env', () => {
    const WordCloud = require('wordcloud');
    expect(typeof WordCloud).toBe('function');
    expect(typeof WordCloud.stop).toBe('function');
  });
});

describe('realistic 40 short-text answers', () => {
  it('builds unique whole-answer items without breaking words', () => {
    const { buildExitTicketWordCloudItems } = require('./exitTicketWordCloud');
    const whole = buildExitTicketWordCloudItems({ texts: REALISTIC, mode: 'phrases' });
    expect(whole.length).toBeGreaterThan(12);
    whole.forEach((item) => {
      expect(item.label.includes('\n')).toBe(false);
    });
    const words = buildExitTicketWordCloudItems({ texts: REALISTIC, mode: 'words' });
    const packed = buildBulbCloudLists(words);
    expect(packed.fillerList.length === 0 || packed.realCount < 40).toBe(true);
  });
});
