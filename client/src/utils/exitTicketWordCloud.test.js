import {
  buildExitTicketWordCloudItems,
  resolveExitTicketAnswerLabel,
} from './exitTicketWordCloud';

describe('buildExitTicketWordCloudItems', () => {
  it('merges case in Each word mode and drops stop words', () => {
    const items = buildExitTicketWordCloudItems({
      texts: ['Good', 'very good', 'GOOD', 'Good pace'],
      mode: 'words',
    });
    const byKey = Object.fromEntries(items.map((i) => [i.key, i]));
    expect(byKey.good.count).toBe(4);
    expect(byKey.very.count).toBe(1);
    expect(byKey.pace.count).toBe(1);
    expect(byKey.the).toBeUndefined();
  });

  it('merges case in Whole answer mode without splitting', () => {
    const items = buildExitTicketWordCloudItems({
      texts: ['Good', 'very good', 'GOOD', 'Good pace'],
      mode: 'phrases',
    });
    const byKey = Object.fromEntries(items.map((i) => [i.key, i]));
    expect(byKey.good.count).toBe(2);
    expect(byKey['very good'].count).toBe(1);
    expect(byKey['good pace'].count).toBe(1);
  });
});

describe('resolveExitTicketAnswerLabel', () => {
  it('maps MC index to option label', () => {
    const question = { type: 'multiple_choice', options: ['Yes', 'Maybe', 'No'] };
    expect(resolveExitTicketAnswerLabel(1, question)).toBe('Maybe');
    expect(resolveExitTicketAnswerLabel('Yes', question)).toBe('Yes');
  });
});
