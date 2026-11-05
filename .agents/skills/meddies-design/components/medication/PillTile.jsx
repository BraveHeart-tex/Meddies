import React from 'react';

export function PillTile({ tone = 'blush', shape = 'round', size = 46, background }) {
  const bg = background || 'var(--id-' + tone + '-bg)';
  const fg = 'var(--id-' + tone + '-fg)';
  const g = Math.round(size * 0.44);
  let glyph;
  if (shape === 'capsule') glyph = <span style={{ width: g * 0.5, height: g * 1.25, borderRadius: g, background: fg, transform: 'rotate(40deg)' }} />;
  else if (shape === 'square') glyph = <span style={{ width: g, height: g, borderRadius: 6, background: fg }} />;
  else if (shape === 'ring') glyph = <span style={{ width: g, height: g, borderRadius: g, background: '#fff', border: '2px solid ' + fg }} />;
  else if (shape === 'scored') glyph = <span style={{ width: g, height: g, borderRadius: g, background: fg, border: '2px solid var(--berry-500)' }} />;
  else glyph = <span style={{ width: g, height: g, borderRadius: g, background: fg }} />;
  return (
    <span aria-hidden="true" style={{ width: size, height: size, borderRadius: size >= 50 ? 18 : 16, background: bg, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      {glyph}
    </span>
  );
}
