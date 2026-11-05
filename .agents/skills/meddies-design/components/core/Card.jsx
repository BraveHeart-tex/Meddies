import React from 'react';

const V = {
  default: { background: 'var(--surface-card)', border: '1px solid var(--border-default)', radius: 'var(--radius-card)' },
  attention: { background: 'var(--surface-card)', border: '1.5px solid var(--border-attention)', radius: 'var(--radius-card)' },
  accent: { background: 'var(--surface-accent)', border: '1px solid transparent', radius: 'var(--radius-hero)' },
  dashed: { background: 'var(--surface-card)', border: '1.5px dashed var(--border-strong)', radius: 'var(--radius-card)' },
  sunken: { background: 'var(--surface-sunken)', border: '1px solid transparent', radius: 'var(--radius-md)' },
};

export function Card({ children, variant = 'default', padding = 16, onClick, style }) {
  const v = V[variant] || V.default;
  return (
    <div onClick={onClick} role={onClick ? 'button' : undefined} tabIndex={onClick ? 0 : undefined}
      style={{ background: v.background, border: v.border, borderRadius: v.radius, padding, cursor: onClick ? 'pointer' : undefined, ...style }}>
      {children}
    </div>
  );
}
