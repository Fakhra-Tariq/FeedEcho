import React, { useMemo, useState } from 'react';
import { ExitTicketWordCloudPresent } from '../../components/Host/ExitTicketWordCloud';

const THREE = [
  { key: 'good', label: 'Good', count: 1 },
  { key: 'average', label: 'Average', count: 1 },
  { key: 'very good', label: 'Very good', count: 1 },
];

const ONE = [{ key: 'abc13423', label: 'abc13423', count: 1 }];
const THREE_PLUS = [...THREE, { key: 'new', label: 'NewAnswer', count: 1 }];

function many(n) {
  return Array.from({ length: n }, (_, i) => ({
    key: `w${i}`,
    label: i % 7 === 0 ? 'helpful' : i % 5 === 0 ? 'clear' : `word${i}`,
    count: Math.max(1, n - i),
  }));
}

export default function WordCloudPreview() {
  const params = new URLSearchParams(window.location.search);
  const n = params.get('n') || '3';
  const [mode, setMode] = useState('words');
  const items = useMemo(() => {
    if (n === '0') return [];
    if (n === '1') return ONE;
    if (n === '3') return THREE;
    if (n === '4') return THREE_PLUS;
    if (n === '80') return many(80);
    return many(40);
  }, [n]);

  return (
    <ExitTicketWordCloudPresent
      open
      onClose={() => {}}
      questionIndex={0}
      questionCount={1}
      onPrev={() => {}}
      onNext={() => {}}
      question={{ type: 'short_text', prompt: 'Preview' }}
      items={items}
      extra={0}
      responseCount={Number(n) || items.length}
      shortTextMode={mode}
      onShortTextModeChange={setMode}
    />
  );
}
