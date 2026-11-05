import React from 'react';
import { Icon } from './Icon.jsx';

const V = {
  surface: { background: 'var(--surface-card)', border: '1px solid var(--border-default)', radius: '50%' },
  sunken: { background: 'var(--surface-sunken)', border: '1px solid transparent', radius: 'var(--radius-sm)' },
  primary: { background: 'var(--action-primary)', border: '1px solid transparent', radius: '50%', color: 'var(--text-on-primary)' },
};

export function IconButton({ icon, label, variant = 'surface', size = 44, iconSize, disabled = false, onClick, style }) {
  const v = V[variant] || V.surface;
  return (
    <button type="button" aria-label={label} title={label} disabled={disabled} onClick={onClick}
      style={{
        width: size, height: size, flexShrink: 0, borderRadius: v.radius, background: v.background, border: v.border,
        color: v.color || 'var(--text-primary)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.4 : 1, padding: 0, ...style,
      }}>
      <Icon name={icon} size={iconSize || (icon === 'settings' ? 20 : 14)} />
    </button>
  );
}
