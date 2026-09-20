import React from 'react';
import { Search } from 'lucide-react';
import clsx from 'clsx';

const formatTabLabel = (value) =>
  value === 'all' ? 'All' : value.charAt(0).toUpperCase() + value.slice(1);

/**
 * Shared status-pill tabs + search row for host list pages.
 *
 * @param {string[]} tabs - Status values, e.g. ['all', 'draft', 'active']
 * @param {string} activeTab - Currently selected status value
 * @param {(value: string) => void} onTabChange - Called with the clicked status value
 * @param {string} searchTerm - Controlled search input value
 * @param {(value: string) => void} onSearchChange - Called with the new search text
 * @param {string} [searchPlaceholder]
 * @param {string} [className] - Optional wrapper classes
 */
export default function ListFilterBar({
  tabs = [],
  activeTab,
  onTabChange,
  searchTerm = '',
  onSearchChange,
  searchPlaceholder = 'Search…',
  className = '',
}) {
  return (
    <div
      className={clsx(
        'flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between',
        className
      )}
    >
      <div className="flex flex-wrap gap-2">
        {tabs.map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => onTabChange?.(tab)}
            className={clsx(
              'px-4 py-2 rounded-xl font-medium text-sm transition-all duration-200',
              activeTab === tab
                ? 'bg-primary text-white shadow-md'
                : 'bg-white text-text-light border border-primary/15 hover:text-text hover:border-primary/30'
            )}
          >
            {formatTabLabel(tab)}
          </button>
        ))}
      </div>

      <div className="relative w-full sm:w-72">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-text-light" />
        <input
          type="text"
          value={searchTerm}
          onChange={(event) => onSearchChange?.(event.target.value)}
          placeholder={searchPlaceholder}
          className="w-full pl-11 pr-4 py-2.5 bg-white border border-primary/15 rounded-xl text-sm text-text placeholder-text-light focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/40 transition-all duration-200"
        />
      </div>
    </div>
  );
}
