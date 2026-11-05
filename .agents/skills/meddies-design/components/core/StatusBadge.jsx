import React from 'react';
import { Icon } from './Icon.jsx';

const MAP = {
  taken: { icon: 'check', label: 'Taken', fg: 'var(--status-taken-fg)', bg: 'var(--status-taken-bg)', iconW: 2.4 },
  notLogged: { icon: 'notLogged', label: 'Not logged', fg: 'var(--status-notlogged-fg)', bg: 'var(--status-notlogged-bg)' },
  scheduled: { icon: 'clock', label: 'Scheduled', fg: 'var(--status-scheduled-fg)', bg: 'transparent', border: 'var(--status-scheduled-border)' },
  skipped: { icon: 'skipped', label: 'Skipped', fg: 'var(--status-skipped-fg)', bg: 'var(--status-skipped-bg)' },
  low: { icon: 'warning', label: 'Low', fg: 'var(--stock-low-fg)', bg: 'var(--stock-low-bg)' },
};

export function StatusBadge({ status = 'scheduled', time, label, size = 'md', style }) {
  const m = MAP[status] || MAP.scheduled;
  const text = label || (time ? m.label + ' ' + time : m.label);
  const small = size === 'sm';
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap',
      padding: m.border ? (small ? '5px 9px 5px 7px' : '6px 10px 6px 8px') : (small ? '6px 9px 6px 7px' : '7px 10px 7px 8px'),
      borderRadius: 'var(--radius-pill)', background: m.bg, color: m.fg,
      border: m.border ? '1px solid ' + m.border : 'none',
      font: small ? 'var(--weight-heavy) var(--size-micro)/1 var(--font-family-base)' : 'var(--type-chip)', ...style,
    }}>
      <Icon name={m.icon} size={small ? 12 : 13} strokeWidth={m.iconW} />
      {text}
    </span>
  );
}
