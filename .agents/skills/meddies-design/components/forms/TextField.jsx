import React from 'react';
import { Icon } from '../core/Icon.jsx';

export function TextField({ label, value, defaultValue, placeholder, icon, hint, onChange, type = 'text', style }) {
  const [focus, setFocus] = React.useState(false);
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 8, ...style }}>
      {label ? <span style={{ font: 'var(--type-card-title)' }}>{label}</span> : null}
      <span style={{
        height: 48, display: 'flex', alignItems: 'center', gap: 10, padding: '0 16px',
        background: 'var(--surface-card)', borderRadius: 'var(--radius-md)',
        border: '1px solid ' + (focus ? 'var(--action-primary)' : 'var(--border-default)'),
        boxShadow: focus ? 'var(--focus-ring)' : 'none', color: 'var(--text-placeholder)',
      }}>
        {icon ? <Icon name={icon} size={18} /> : null}
        <input type={type} value={value} defaultValue={defaultValue} placeholder={placeholder}
          onChange={(e) => onChange && onChange(e.target.value)} onFocus={() => setFocus(true)} onBlur={() => setFocus(false)}
          style={{ flex: 1, minWidth: 0, border: 0, outline: 'none', background: 'transparent', font: 'var(--weight-medium) var(--size-body)/1 var(--font-family-base)', color: 'var(--text-primary)' }} />
      </span>
      {hint ? <span style={{ font: 'var(--type-detail)', color: 'var(--text-muted)' }}>{hint}</span> : null}
    </label>
  );
}
