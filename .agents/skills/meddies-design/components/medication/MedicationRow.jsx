import React from 'react';
import { PillTile } from './PillTile.jsx';
import { StatusBadge } from '../core/StatusBadge.jsx';
import { Button } from '../core/Button.jsx';

export function MedicationRow({ name, strength, form, schedule, stock, low = false, tone, shape, onAddSchedule, onClick, style }) {
  const unscheduled = !schedule;
  return (
    <div onClick={onClick} role={onClick ? 'button' : undefined} tabIndex={onClick ? 0 : undefined}
      style={{
        background: 'var(--surface-card)', borderRadius: 'var(--radius-card)', padding: 14, display: 'flex', gap: 14, alignItems: 'center',
        border: unscheduled ? '1.5px dashed var(--border-strong)' : '1px solid var(--border-default)', cursor: onClick ? 'pointer' : undefined, ...style,
      }}>
      <PillTile tone={tone} shape={shape} />
      <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
        <span style={{ font: 'var(--type-card-title)' }}>{name}</span>
        <span style={{ font: 'var(--type-detail)', color: 'var(--text-muted)' }}>
          {[strength, unscheduled ? 'as needed' : form, unscheduled && stock != null ? stock + ' left' : null].filter(Boolean).join(' · ')}
        </span>
        {schedule ? <span style={{ font: 'var(--weight-bold) var(--size-label)/1.2 var(--font-family-base)' }}>{schedule}</span> : null}
      </span>
      {unscheduled ? (
        <Button variant="soft" size="sm" onClick={(e) => { e.stopPropagation(); onAddSchedule && onAddSchedule(); }}>Add schedule</Button>
      ) : low ? (
        <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 5 }}>
          <StatusBadge status="low" label={stock + ' left'} size="sm" />
          <span style={{ font: 'var(--weight-bold) var(--size-micro)/1 var(--font-family-base)', color: 'var(--stock-low-fg)' }}>Refill soon</span>
        </span>
      ) : stock != null ? (
        <span style={{ font: 'var(--weight-bold) var(--size-label)/1 var(--font-family-base)', color: 'var(--text-muted)' }}>{stock} left</span>
      ) : null}
    </div>
  );
}
