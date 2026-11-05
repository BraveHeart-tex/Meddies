import React from 'react';
import { Icon } from '../core/Icon.jsx';

const OPTS = [
  { value: 'taken', label: 'I took it', icon: 'check' },
  { value: 'skipped', label: 'I skipped it', icon: 'skipped' },
];

export function OutcomeChoice({ value = null, onChange, takenLabel, skippedLabel, style }) {
  const labels = { taken: takenLabel || OPTS[0].label, skipped: skippedLabel || OPTS[1].label };
  return (
    <div role="radiogroup" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, ...style }}>
      {OPTS.map((o) => {
        const sel = value === o.value;
        return (
          <button key={o.value} type="button" role="radio" aria-checked={sel} onClick={() => onChange && onChange(o.value)}
            style={{
              height: 76, borderRadius: 'var(--radius-xl)', padding: '12px 14px', textAlign: 'left', cursor: 'pointer',
              display: 'flex', flexDirection: 'column', justifyContent: 'space-between', alignItems: 'flex-start',
              background: sel ? 'var(--surface-accent)' : 'var(--surface-card)',
              border: sel ? '2px solid var(--action-primary)' : '1.5px solid var(--border-strong)',
              color: sel ? 'var(--text-on-accent)' : 'var(--text-primary)',
              transition: 'background var(--duration-fast) var(--ease-out), border-color var(--duration-fast) var(--ease-out)',
            }}>
            {sel ? (
              <span style={{ width: 24, height: 24, borderRadius: 12, background: 'var(--action-primary)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon name={o.value === 'taken' ? 'check' : 'skipped'} size={14} strokeWidth={2.4} />
              </span>
            ) : (
              <Icon name={o.icon} size={24} color="var(--text-muted)" strokeWidth={1.4} />
            )}
            <span style={{ font: 'var(--type-button)' }}>{labels[o.value]}</span>
          </button>
        );
      })}
    </div>
  );
}
