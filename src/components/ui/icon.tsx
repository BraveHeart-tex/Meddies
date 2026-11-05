import type { ReactNode, SVGProps } from 'react'

// Cozy Care glyph set: rounded line icons drawn on 16/18/20 grids with currentColor.
type Glyph = { box: number; stroke: number; draw: (stroke: number) => ReactNode }
const line = {
  fill: 'none',
  stroke: 'currentColor',
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const

const glyphs = {
  check: {
    box: 16,
    stroke: 2.2,
    draw: (w) => <path d="M3 8.5l3 3 7-7" {...line} strokeWidth={w} />,
  },
  clock: {
    box: 16,
    stroke: 1.6,
    draw: (w) => (
      <g {...line} strokeWidth={w}>
        <circle cx="8" cy="8" r="6.3" />
        <path d="M8 4.8V8l2.2 1.4" />
      </g>
    ),
  },
  notLogged: {
    box: 16,
    stroke: 1.6,
    draw: (w) => (
      <g>
        <circle cx="8" cy="8" r="6.3" {...line} strokeWidth={w} strokeDasharray="2.6 2.1" />
        <circle cx="8" cy="8" r="1.7" fill="currentColor" />
      </g>
    ),
  },
  skipped: {
    box: 16,
    stroke: 1.6,
    draw: (w) => (
      <g {...line} strokeWidth={w}>
        <circle cx="8" cy="8" r="6.3" />
        <path d="M3.6 12.4l8.8-8.8" />
      </g>
    ),
  },
  warning: {
    box: 16,
    stroke: 1.8,
    draw: (w) => <path d="M8 2l6.5 11.5h-13z" {...line} strokeWidth={w} />,
  },
  plus: {
    box: 16,
    stroke: 2.2,
    draw: (w) => <path d="M8 3v10M3 8h10" {...line} strokeWidth={w} />,
  },
  minus: { box: 16, stroke: 2.2, draw: (w) => <path d="M3 8h10" {...line} strokeWidth={w} /> },
  close: {
    box: 16,
    stroke: 2,
    draw: (w) => <path d="M3.5 3.5l9 9M12.5 3.5l-9 9" {...line} strokeWidth={w} />,
  },
  settings: {
    box: 20,
    stroke: 1.8,
    draw: (w) => (
      <g {...line} strokeWidth={w}>
        <path d="M3 6h14M3 14h14" />
        <circle cx="7" cy="6" r="2.4" fill="var(--card)" />
        <circle cx="13" cy="14" r="2.4" fill="var(--card)" />
      </g>
    ),
  },
  today: {
    box: 20,
    stroke: 1.9,
    draw: (w) => (
      <g>
        <circle cx="10" cy="10" r="7" {...line} strokeWidth={w} />
        <circle cx="10" cy="10" r="2.6" fill="currentColor" />
      </g>
    ),
  },
  medications: {
    box: 20,
    stroke: 1.9,
    draw: (w) => (
      <rect
        x="6.5"
        y="2"
        width="7"
        height="16"
        rx="3.5"
        transform="rotate(40 10 10)"
        {...line}
        strokeWidth={w}
      />
    ),
  },
  history: {
    box: 20,
    stroke: 1.9,
    draw: (w) => (
      <g>
        <path d="M7 5h10M7 10h10M7 15h10" {...line} strokeWidth={w} />
        <circle cx="3.5" cy="5" r="1.3" fill="currentColor" />
        <circle cx="3.5" cy="10" r="1.3" fill="currentColor" />
        <circle cx="3.5" cy="15" r="1.3" fill="currentColor" />
      </g>
    ),
  },
} satisfies Record<string, Glyph>

export type IconName = keyof typeof glyphs

// Decorative only: pair every icon with visible text or an accessible name on its control.
export function Icon({
  name,
  size = 16,
  strokeWidth,
  ...props
}: { name: IconName; size?: number; strokeWidth?: number } & Omit<
  SVGProps<SVGSVGElement>,
  'children'
>) {
  const glyph: Glyph = glyphs[name]
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${glyph.box} ${glyph.box}`}
      aria-hidden="true"
      focusable="false"
      {...props}
      className={['block shrink-0', props.className].filter(Boolean).join(' ')}
    >
      {glyph.draw(strokeWidth ?? glyph.stroke)}
    </svg>
  )
}
