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
    let base = [];
    if (n === '0') base = [];
    else if (n === '1') base = ONE;
    else if (n === '2') base = THREE.slice(0, 2);
    else if (n === '3') base = THREE;
    else if (n === '7') base = many(7);
    else if (n === '4') base = THREE_PLUS;
    else if (n === '80') base = many(80);
    else base = many(40);
    if (mode === 'phrases') {
      return base.map((item) => ({
        ...item,
        label: item.label.length > 8 ? item.label : `${item.label} answer`,
      }));
    }
    return base;
  }, [n, mode]);

  return (
    <ExitTicketWordCloudPresent
      open
      onClose={() => {}}
      questionIndex={0}
      questionCount={2}
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
