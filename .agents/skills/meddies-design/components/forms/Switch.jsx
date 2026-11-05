import React from 'react';

export function Switch({ checked = false, onChange, label, description, disabled = false, style }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 14, minHeight: 44, cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.5 : 1, ...style }}>
      {label ? (
        <span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 3 }}>
          <span style={{ font: 'var(--type-card-title)' }}>{label}</span>
          {description ? <span style={{ font: 'var(--type-detail)', color: 'var(--text-muted)' }}>{description}</span> : null}
        </span>
      ) : null}
      <button type="button" role="switch" aria-checked={checked} disabled={disabled} onClick={() => onChange && onChange(!checked)}
        style={{ width: 52, height: 32, borderRadius: 16, border: 0, padding: 3, flexShrink: 0, cursor: 'inherit',
          background: checked ? 'var(--action-primary)' : 'var(--border-strong)', transition: 'background var(--duration-base) var(--ease-out)' }}>
        <span style={{ display: 'block', width: 26, height: 26, borderRadius: 13, background: '#fff',
          transform: checked ? 'translateX(20px)' : 'none', transition: 'transform var(--duration-base) var(--ease-out)', boxShadow: '0 1px 3px rgba(59,42,47,.2)' }} />
      </button>
    </label>
  );
}
