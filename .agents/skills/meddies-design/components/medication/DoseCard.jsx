import React from 'react';
import { StatusBadge } from '../core/StatusBadge.jsx';

export function DoseCard({ time, name, detail, status = 'scheduled', statusTime, onClick, style }) {
  const attention = status === 'notLogged';
  const done = status === 'taken' || status === 'skipped';
  return (
    <div onClick={onClick} role={onClick ? 'button' : undefined} tabIndex={onClick ? 0 : undefined}
      style={{
        background: 'var(--surface-card)', borderRadius: 'var(--radius-card)', padding: '14px 16px', minHeight: 64,
        border: attention ? '1.5px solid var(--border-attention)' : '1px solid var(--border-default)',
        display: 'flex', alignItems: 'center', gap: 14, cursor: onClick ? 'pointer' : undefined, ...style,
      }}>
      <span style={{ font: 'var(--weight-heavy) var(--size-body)/1 var(--font-family-base)', width: 46, flexShrink: 0, color: done ? 'var(--text-muted)' : 'var(--text-primary)' }}>{time}</span>
      <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
        <span style={{ font: 'var(--type-card-title)' }}>{name}</span>
        <span style={{ font: 'var(--type-detail)', color: 'var(--text-muted)' }}>{detail}</span>
      </span>
      <StatusBadge status={status} time={statusTime} />
    </div>
  );
}
