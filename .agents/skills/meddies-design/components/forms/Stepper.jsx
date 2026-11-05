import React from 'react';
import { IconButton } from '../core/IconButton.jsx';

export function Stepper({ label = 'Amount', value = 1, unit = 'tablet', unitPlural, min = 1, max = 20, onChange, style }) {
  const plural = unitPlural || unit + 's';
  const set = (n) => onChange && onChange(Math.max(min, Math.min(max, n)));
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--surface-card)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-lg)', padding: '8px 8px 8px 16px', ...style }}>
      <span style={{ font: 'var(--type-card-title)' }}>{label}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <IconButton icon="minus" label={'Decrease ' + label} variant="sunken" disabled={value <= min} onClick={() => set(value - 1)} />
        <span aria-live="polite" style={{ font: 'var(--type-button)', minWidth: 74, textAlign: 'center' }}>{value} {value === 1 ? unit : plural}</span>
        <IconButton icon="plus" label={'Increase ' + label} variant="sunken" disabled={value >= max} onClick={() => set(value + 1)} />
      </div>
    </div>
  );
}
