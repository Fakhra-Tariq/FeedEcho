import React from 'react';

/**
 * Ambient hero backdrop for marketing pages (About, etc.).
 * Sketch sits on the sides so center copy stays legible; opacity set in CSS
 * (not Tailwind arbitrary opacity) so it reliably renders.
 */
export function MarketingHeroBackdrop({ className = '' }) {
  return (
    <div
      className={`marketing-hero-backdrop pointer-events-none absolute inset-0 overflow-hidden ${className}`.trim()}
      aria-hidden
    >
      <div className="marketing-hero-backdrop__wash" />
      <div className="marketing-hero-backdrop__blob marketing-hero-backdrop__blob--tr" />
      <div className="marketing-hero-backdrop__blob marketing-hero-backdrop__blob--bl" />

      {/* Left cluster — speaker + audience (outside center text column) */}
      <svg
        className="marketing-hero-sketch marketing-hero-sketch--left"
        viewBox="0 0 420 420"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        preserveAspectRatio="xMinYMid meet"
      >
        <circle cx="200" cy="110" r="26" stroke="currentColor" strokeWidth="3" />
        <path
          d="M165 210c10-42 26-60 35-60s25 18 35 60"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
        />
        <path d="M175 255h50" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />

        <circle cx="90" cy="290" r="16" stroke="currentColor" strokeWidth="2.5" />
        <path d="M68 350c7-28 16-40 22-40s15 12 22 40" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
        <circle cx="165" cy="300" r="16" stroke="currentColor" strokeWidth="2.5" />
        <path d="M143 360c7-28 16-40 22-40s15 12 22 40" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
        <circle cx="240" cy="300" r="16" stroke="currentColor" strokeWidth="2.5" />
        <path d="M218 360c7-28 16-40 22-40s15 12 22 40" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
        <circle cx="315" cy="290" r="16" stroke="currentColor" strokeWidth="2.5" />
        <path d="M293 350c7-28 16-40 22-40s15 12 22 40" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />

        <rect x="300" y="70" width="95" height="56" rx="16" stroke="currentColor" strokeWidth="2.5" />
        <path d="M320 126 L328 142 L342 126" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round" />
        <circle cx="328" cy="98" r="3.5" fill="currentColor" />
        <circle cx="348" cy="98" r="3.5" fill="currentColor" />
        <circle cx="368" cy="98" r="3.5" fill="currentColor" />

        <circle cx="70" cy="80" r="40" stroke="currentColor" strokeWidth="2" strokeDasharray="5 7" />
        <path d="M40 170 L80 148 L120 170 L80 192 Z" stroke="currentColor" strokeWidth="2" />
      </svg>

      {/* Right cluster — projector / screen */}
      <svg
        className="marketing-hero-sketch marketing-hero-sketch--right"
        viewBox="0 0 420 420"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        preserveAspectRatio="xMaxYMid meet"
      >
        <rect x="80" y="80" width="280" height="175" rx="12" stroke="currentColor" strokeWidth="3" />
        <path d="M120 220H320" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
        <path d="M120 140H290" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
        <path d="M120 175H250" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
        <path d="M200 270 L220 255 L240 270" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M220 255 V305" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />

        <rect x="40" y="300" width="88" height="50" rx="14" stroke="currentColor" strokeWidth="2.5" />
        <path d="M105 350 L95 366 L82 350" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round" />

        <circle cx="350" cy="330" r="48" stroke="currentColor" strokeWidth="2" strokeDasharray="6 8" />
      </svg>
    </div>
  );
}

export default MarketingHeroBackdrop;
