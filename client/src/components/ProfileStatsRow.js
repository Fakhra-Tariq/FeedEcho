import React from 'react';

/**
 * Shared 3-column stats row for Student and Teacher profile pages.
 */
export default function ProfileStatsRow({ items = [], loading = false }) {
  return (
    <div
      className="grid grid-cols-3 w-full rounded-xl overflow-hidden mb-5 shadow-sm"
      style={{ border: '0.5px solid #E8E0F0' }}
    >
      {items.map((item, index) => {
        const Icon = item.icon;
        return (
          <div
            key={item.label}
            className="flex flex-col items-center justify-center py-3.5 px-2 min-w-0"
            style={{
              backgroundColor: '#FFFFFF',
              borderLeft: index > 0 ? '0.5px solid #E8E0F0' : undefined,
            }}
          >
            <Icon className="w-4 h-4 text-primary mb-1.5 shrink-0" aria-hidden />
            <p className="text-lg font-bold text-gray-900 leading-tight">
              {loading ? '—' : item.value}
            </p>
            <p className="text-xs text-gray-500 mt-0.5 text-center">{item.label}</p>
          </div>
        );
      })}
    </div>
  );
}
