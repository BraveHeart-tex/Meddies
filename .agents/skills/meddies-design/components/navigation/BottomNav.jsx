import React from 'react';
import { Icon } from '../core/Icon.jsx';

const ITEMS = [
  { id: 'today', label: 'Today', icon: 'today' },
  { id: 'medications', label: 'Medications', icon: 'medications' },
  { id: 'history', label: 'History', icon: 'history' },
];

export function BottomNav({ active = 'today', onChange, floating = true, style }) {
  return (
    <nav aria-label="Main" style={{
      position: floating ? 'absolute' : 'relative', left: floating ? 'var(--nav-inset)' : undefined, right: floating ? 'var(--nav-inset)' : undefined,
      bottom: floating ? 'var(--nav-bottom)' : undefined, height: 'var(--nav-height)', borderRadius: 34, background: 'var(--surface-card)',
      boxShadow: 'var(--shadow-float)', display: 'flex', alignItems: 'center', padding: 6, gap: 4, ...style,
    }}>
      {ITEMS.map((it) => {
        const on = it.id === active;
        return (
          <button key={it.id} type="button" aria-current={on ? 'page' : undefined} onClick={() => onChange && onChange(it.id)}
            style={{
              flex: 1, height: 56, borderRadius: 28, border: 0, cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4,
              background: on ? 'var(--surface-accent)' : 'transparent', color: on ? 'var(--text-on-accent)' : 'var(--text-muted)',
              font: on ? 'var(--weight-heavy) var(--size-micro)/1 var(--font-family-base)' : 'var(--type-nav)',
              transition: 'background var(--duration-base) var(--ease-out)',
            }}>
            <Icon name={it.icon} size={20} />
            {it.label}
          </button>
        );
      })}
    </nav>
  );
}
