import React from 'react';

export function ChipGroup({ options = [], value, onChange, label, style }) {
  return (
    <div role="radiogroup" aria-label={label} style={{ display: 'flex', gap: 8, ...style }}>
      {options.map((o) => {
        const sel = o.value === value;
        return (
          <button key={o.value} type="button" role="radio" aria-checked={sel} onClick={() => onChange && onChange(o.value)}
            style={{
              flex: o.grow === false ? '0 0 auto' : 1, minWidth: 72, height: 'var(--control-chip)', padding: '0 12px',
              borderRadius: 'var(--radius-md)', cursor: 'pointer', font: 'var(--weight-heavy) var(--size-body-sm)/1 var(--font-family-base)',
              background: sel ? 'var(--action-primary)' : 'var(--surface-card)',
              color: sel ? 'var(--text-on-primary)' : 'var(--text-primary)',
              border: sel ? '1px solid transparent' : '1px solid var(--border-strong)',
            }}>
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
