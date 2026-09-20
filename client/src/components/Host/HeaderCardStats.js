import React from 'react';
import clsx from 'clsx';

const COLUMN_CLASSES = {
  2: 'sm:grid-cols-2',
  3: 'sm:grid-cols-3',
  4: 'sm:grid-cols-4',
};

/**
 * Real-time stat row rendered at the bottom of a PageHeaderCard
 * (Exit Ticket, Space Race, Library).
 *
 * @param {{label: string, value: React.ReactNode}[]} stats - Label/count pairs
 * @param {string} [className] - Optional wrapper classes
 */
export default function HeaderCardStats({ stats = [], className = '' }) {
  if (!stats.length) return null;

  return (
    <div
      className={clsx(
        'grid grid-cols-2 gap-4 mt-6',
        COLUMN_CLASSES[stats.length] || 'sm:grid-cols-4',
        className
      )}
    >
      {stats.map(({ label, value }) => (
        <div key={label}>
          <p className="text-white/80 text-sm">{label}</p>
          <p className="text-2xl font-bold text-white">{value}</p>
        </div>
      ))}
    </div>
  );
}
