import React from 'react';
import { IconButton } from '../core/IconButton.jsx';

export function AppHeader({ eyebrow, title, subtitle, action, onSettings, style }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: subtitle ? 'center' : 'flex-start', gap: 12, ...style }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
        {eyebrow ? <span style={{ font: 'var(--weight-bold) var(--size-body-sm)/1.2 var(--font-family-base)', color: 'var(--text-muted)' }}>{eyebrow}</span> : null}
        <span style={{ font: 'var(--type-display)', letterSpacing: 'var(--tracking-display)' }}>{title}</span>
        {subtitle ? <span style={{ font: 'var(--type-meta)', color: 'var(--text-muted)' }}>{subtitle}</span> : null}
      </div>
      {action || (onSettings ? <IconButton icon="settings" label="Settings" onClick={onSettings} /> : null)}
    </div>
  );
}
