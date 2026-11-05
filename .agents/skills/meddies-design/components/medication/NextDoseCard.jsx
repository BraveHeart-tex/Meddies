import React from 'react';
import { StatusBadge } from '../core/StatusBadge.jsx';
import { Button } from '../core/Button.jsx';
import { PillTile } from './PillTile.jsx';

export function NextDoseCard({ eyebrow = 'Up next', name, strength, dose, dueTime, status = 'notLogged', tone, shape, onTaken, onSkip, style }) {
  return (
    <div style={{ background: 'var(--surface-accent)', borderRadius: 'var(--radius-hero)', padding: 20, display: 'flex', flexDirection: 'column', gap: 16, ...style }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ font: 'var(--type-eyebrow)', letterSpacing: 'var(--tracking-eyebrow)', textTransform: 'uppercase', color: 'var(--text-on-accent)' }}>{eyebrow}</span>
        <StatusBadge status={status} />
      </div>
      <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
        <PillTile tone={tone} shape={shape} size={52} background="var(--surface-card)" />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <span style={{ font: 'var(--type-title)' }}>{name}</span>
          <span style={{ font: 'var(--type-support)', color: 'var(--text-secondary)' }}>{[strength, dose, dueTime ? 'due ' + dueTime : null].filter(Boolean).join(' · ')}</span>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 10 }}>
        <Button icon="check" onClick={onTaken} style={{ flex: 1 }}>Taken</Button>
        <Button variant="secondary" onClick={onSkip} style={{ width: 112, border: '1px solid transparent' }}>Skip</Button>
      </div>
    </div>
  );
}
