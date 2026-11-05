import React from 'react';

export function Sheet({ open = true, onClose, children, label, style }) {
  const [shown, setShown] = React.useState(false);
  React.useEffect(() => {
    if (!open) { setShown(false); return; }
    const id = setTimeout(() => setShown(true), 16);
    return () => clearTimeout(id);
  }, [open]);
  if (!open) return null;
  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 20 }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'var(--scrim)', opacity: shown ? 1 : 0, transition: 'opacity var(--duration-sheet) var(--ease-out)' }} />
      <div role="dialog" aria-modal="true" aria-label={label}
        style={{
          position: 'absolute', left: 0, right: 0, bottom: 0, background: 'var(--surface-sheet)', borderRadius: 'var(--radius-sheet) var(--radius-sheet) 0 0',
          padding: '10px 20px 40px', display: 'flex', flexDirection: 'column', gap: 18, boxShadow: 'var(--shadow-sheet)',
          transform: shown ? 'translateY(0)' : 'translateY(100%)', transition: 'transform var(--duration-sheet) var(--ease-out)', ...style,
        }}>
        <span style={{ width: 40, height: 5, borderRadius: 3, background: 'var(--cream-400)', alignSelf: 'center' }} />
        {children}
      </div>
    </div>
  );
}
