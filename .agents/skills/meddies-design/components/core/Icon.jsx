import React from 'react';

const S = { fill: 'none', stroke: 'currentColor', strokeLinecap: 'round', strokeLinejoin: 'round' };

const ICONS = {
  check: { vb: 16, w: 2.2, el: (w) => <path d="M3 8.5l3 3 7-7" {...S} strokeWidth={w} /> },
  clock: { vb: 16, w: 1.6, el: (w) => <g {...S} strokeWidth={w}><circle cx="8" cy="8" r="6.3" /><path d="M8 4.8V8l2.2 1.4" /></g> },
  notLogged: { vb: 16, w: 1.6, el: (w) => <g><circle cx="8" cy="8" r="6.3" {...S} strokeWidth={w} strokeDasharray="2.6 2.1" /><circle cx="8" cy="8" r="1.7" fill="currentColor" /></g> },
  skipped: { vb: 16, w: 1.6, el: (w) => <g {...S} strokeWidth={w}><circle cx="8" cy="8" r="6.3" /><path d="M3.6 12.4l8.8-8.8" /></g> },
  warning: { vb: 16, w: 1.8, el: (w) => <path d="M8 2l6.5 11.5h-13z" {...S} strokeWidth={w} /> },
  plus: { vb: 16, w: 2.2, el: (w) => <path d="M8 3v10M3 8h10" {...S} strokeWidth={w} /> },
  minus: { vb: 16, w: 2.2, el: (w) => <path d="M3 8h10" {...S} strokeWidth={w} /> },
  close: { vb: 16, w: 2, el: (w) => <path d="M3.5 3.5l9 9M12.5 3.5l-9 9" {...S} strokeWidth={w} /> },
  search: { vb: 18, w: 1.8, el: (w) => <g {...S} strokeWidth={w}><circle cx="8" cy="8" r="5.5" /><path d="M12.2 12.2L16 16" /></g> },
  settings: { vb: 20, w: 1.8, el: (w) => <g {...S} strokeWidth={w}><path d="M3 6h14M3 14h14" /><circle cx="7" cy="6" r="2.4" fill="var(--surface-card)" /><circle cx="13" cy="14" r="2.4" fill="var(--surface-card)" /></g> },
  today: { vb: 20, w: 1.9, el: (w) => <g><circle cx="10" cy="10" r="7" {...S} strokeWidth={w} /><circle cx="10" cy="10" r="2.6" fill="currentColor" /></g> },
  medications: { vb: 20, w: 1.9, el: (w) => <rect x="6.5" y="2" width="7" height="16" rx="3.5" transform="rotate(40 10 10)" {...S} strokeWidth={w} /> },
  history: { vb: 20, w: 1.9, el: (w) => <g><path d="M7 5h10M7 10h10M7 15h10" {...S} strokeWidth={w} /><circle cx="3.5" cy="5" r="1.3" fill="currentColor" /><circle cx="3.5" cy="10" r="1.3" fill="currentColor" /><circle cx="3.5" cy="15" r="1.3" fill="currentColor" /></g> },
  chevronRight: { vb: 16, w: 2, el: (w) => <path d="M6 3.5L10.5 8 6 12.5" {...S} strokeWidth={w} /> },
};

export const ICON_NAMES = Object.keys(ICONS);

export function Icon({ name, size = 16, color = 'currentColor', strokeWidth, title, style }) {
  const def = ICONS[name];
  if (!def) return null;
  return (
    <svg width={size} height={size} viewBox={'0 0 ' + def.vb + ' ' + def.vb} style={{ color, flexShrink: 0, display: 'block', ...style }}
      role={title ? 'img' : undefined} aria-hidden={title ? undefined : true} aria-label={title}>
      {def.el(strokeWidth || def.w)}
    </svg>
  );
}
