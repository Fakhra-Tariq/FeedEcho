import {
  WORD_CLOUD_BG,
  WORD_CLOUD_BULB_FILL,
  bulbMetrics,
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

describe('bulbMetrics', () => {
  it('keeps a round glass about 70% tall and a small base', () => {
    const m = bulbMetrics(800, 1000);
    expect(m.R * 2).toBeGreaterThan(650);
    expect(m.R * 2).toBeLessThan(760);
    expect(m.baseBottom - m.baseTop).toBeGreaterThan(80);
    expect(m.baseBottom - m.baseTop).toBeLessThan(140);
    expect(m.cx).toBe(400);
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
