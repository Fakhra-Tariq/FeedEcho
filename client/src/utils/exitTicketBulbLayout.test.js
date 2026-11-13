import {
  WORD_CLOUD_BG,
  WORD_CLOUD_BULB_FILL,
  BRAIN_SHAPE,
  brainMetrics,
  fitBrainBox,
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
    const box = fitBrainBox(796, 220, { viewportW: 844, viewportH: 390 });
    expect(box.height).toBeLessThanOrEqual(220);
    expect(box.width).toBeLessThanOrEqual(796);
    expect(box.width / box.height).toBeCloseTo(700 / 440);
  });

  it('uses nearly the full padded width on phone portrait', () => {
    const box = fitBrainBox(272, 500, { viewportW: 320, viewportH: 568 });
    expect(box.width).toBeGreaterThan(260);
    expect(box.width).toBeLessThanOrEqual(272);
  });
});

describe('brainMetrics', () => {
  it('fits the 700x440 brain in the canvas and keeps aspect ratio', () => {
    expect(BRAIN_SHAPE.designWidth / BRAIN_SHAPE.designHeight).toBeCloseTo(700 / 440);
    const m = brainMetrics(1240, 1000);
    expect(m.drawnW / m.drawnH).toBeCloseTo(700 / 440);
    expect(m.drawnW).toBeLessThanOrEqual(1240);
    expect(m.drawnH).toBeLessThanOrEqual(1000);
    expect(m.cx).toBeCloseTo(m.ox + BRAIN_SHAPE.origin.x * m.scale);
    expect(m.cy).toBeCloseTo(m.oy + BRAIN_SHAPE.origin.y * m.scale);
  });

  it('isPointInBrain covers the middle lobe and not the corners', () => {
    const { isPointInBrain } = require('./exitTicketBulbLayout');
    const w = 700;
    const h = 440;
    const m = brainMetrics(w, h);
    expect(isPointInBrain(m.cx, m.cy, w, h)).toBe(true);
    expect(isPointInBrain(2, 2, w, h)).toBe(false);
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
