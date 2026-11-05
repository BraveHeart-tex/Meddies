import React from 'react';
import { Icon } from '../core/Icon.jsx';

export function Toast({ message, icon = 'check', actionLabel, onAction, visible = true, style }) {
  return (
    <div role="status" aria-live="polite" style={{
      display: 'flex', alignItems: 'center', gap: 10, minHeight: 52, padding: '10px 10px 10px 14px', borderRadius: 'var(--radius-lg)',
      background: 'var(--cocoa-900)', color: '#fff', boxShadow: 'var(--shadow-toast)',
      opacity: visible ? 1 : 0, transform: visible ? 'translateY(0)' : 'translateY(8px)',
      transition: 'opacity var(--duration-base) var(--ease-out), transform var(--duration-base) var(--ease-out)', ...style,
    }}>
      <span style={{ width: 26, height: 26, borderRadius: 13, background: 'var(--sage-100)', color: 'var(--sage-700)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Icon name={icon} size={14} strokeWidth={2.4} />
      </span>
      <span style={{ flex: 1, font: 'var(--weight-bold) var(--size-body-sm)/1.3 var(--font-family-base)' }}>{message}</span>
      {actionLabel ? (
        <button type="button" onClick={onAction} style={{ height: 36, padding: '0 12px', borderRadius: 12, border: 0, background: 'rgba(255,255,255,.12)', color: 'var(--blush-100)', font: 'var(--type-chip)', cursor: 'pointer' }}>{actionLabel}</button>
      ) : null}
    </div>
  );
}
