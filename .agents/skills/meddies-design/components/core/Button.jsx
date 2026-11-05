import React from 'react';
import { Icon } from './Icon.jsx';

const SIZES = {
  sm: { height: 'var(--control-sm)', radius: 'var(--radius-xs)', font: 'var(--type-chip)', pad: '0 12px', icon: 14 },
  md: { height: 'var(--control-md)', radius: 'var(--radius-md)', font: 'var(--weight-heavy) var(--size-body)/1 var(--font-family-base)', pad: '0 18px', icon: 16 },
  lg: { height: 'var(--control-lg)', radius: 'var(--radius-lg)', font: 'var(--type-button)', pad: '0 20px', icon: 18 },
  xl: { height: 'var(--control-xl)', radius: 'var(--radius-xl)', font: 'var(--type-button)', pad: '0 24px', icon: 18 },
};
const VARIANTS = {
  primary: { background: 'var(--action-primary)', color: 'var(--text-on-primary)', border: '1px solid transparent', pressed: 'var(--action-primary-pressed)' },
  secondary: { background: 'var(--surface-card)', color: 'var(--text-primary)', border: '1px solid var(--border-strong)', pressed: 'var(--surface-sunken)' },
  soft: { background: 'var(--surface-accent)', color: 'var(--text-on-accent)', border: '1px solid transparent', pressed: '#F2CDD7' },
  ghost: { background: 'transparent', color: 'var(--text-secondary)', border: '1px solid transparent', pressed: 'var(--surface-sunken)' },
};

export function Button({ children, variant = 'primary', size = 'lg', icon, pill = false, fullWidth = false, disabled = false, onClick, type = 'button', style }) {
  const [down, setDown] = React.useState(false);
  const s = SIZES[size] || SIZES.lg;
  const v = VARIANTS[variant] || VARIANTS.primary;
  return (
    <button type={type} disabled={disabled} onClick={onClick}
      onPointerDown={() => setDown(true)} onPointerUp={() => setDown(false)} onPointerLeave={() => setDown(false)}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        height: s.height, padding: s.pad, borderRadius: pill ? 'var(--radius-pill)' : s.radius,
        font: s.font, background: down && !disabled ? v.pressed : v.background, color: v.color, border: v.border,
        width: fullWidth ? '100%' : undefined, cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.45 : 1,
        transform: down && !disabled ? 'scale(0.98)' : 'none',
        transition: 'background var(--duration-fast) var(--ease-out), transform var(--duration-fast) var(--ease-out)',
        WebkitTapHighlightColor: 'transparent', whiteSpace: 'nowrap', ...style,
      }}>
      {icon ? <Icon name={icon} size={s.icon} /> : null}
      {children}
    </button>
  );
}
