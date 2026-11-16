import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import type { LabType } from './medication-types-model'

// #265 Type icons: two-tone filled glyphs on the medication tile tints. The solid tone is the
// tile's glyph color, the soft tone the same color at 45%, highlights the card color. Drawn on a
// 24px grid with rounded joins so they sit beside the Two capsules mark. Decorative only.
const soft = { opacity: 0.45 }

const glyphs: Record<LabType, ReactNode> = {
  // Two round tablets, the front one scored.
  tablet: (
    <>
      <circle cx="8.5" cy="9" r="5.5" style={soft} />
      <circle cx="14" cy="14.5" r="6.5" />
      <path
        d="M10.4 18.1 17.6 10.9"
        className="stroke-card"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </>
  ),
  // A two-tone capsule on the diagonal, as in the logo.
  capsule: (
    <g transform="rotate(45 12 12)">
      <path d="M8 12V7a4 4 0 0 1 8 0v5z" />
      <path d="M8 12v5a4 4 0 0 0 8 0v-5z" style={soft} />
      <path
        d="M10.4 6.4v3.4"
        className="stroke-card"
        strokeWidth="1.4"
        strokeLinecap="round"
        opacity="0.8"
      />
    </g>
  ),
  // A medicine bottle with a cap and a labelled body.
  liquid: (
    <>
      <rect x="8.5" y="2" width="7" height="3.5" rx="1.2" style={soft} />
      <path d="M9.5 5.5h5v1.6l2.6 2.2c.6.5.9 1.2.9 2V19a3 3 0 0 1-3 3H9a3 3 0 0 1-3-3v-7.7c0-.8.3-1.5.9-2l2.6-2.2z" />
      <rect x="6" y="12" width="12" height="5.5" className="fill-card" opacity="0.9" />
      <path
        d="M12 13.4v2.7M10.65 14.75h2.7"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    </>
  ),
  // A pressurised inhaler: canister above an L-shaped actuator with its mouthpiece.
  inhaler: (
    <>
      <rect x="11" y="2" width="5.5" height="9" rx="1.6" style={soft} />
      <path d="M10 8.5h7.5a1.5 1.5 0 0 1 1.5 1.5v9.5a2.5 2.5 0 0 1-2.5 2.5H5.5A2.5 2.5 0 0 1 3 19.5v-2A2.5 2.5 0 0 1 5.5 15H8.5v-5A1.5 1.5 0 0 1 10 8.5z" />
      <rect
        x="4.6"
        y="17.3"
        width="3.6"
        height="1.9"
        rx="0.95"
        className="fill-card"
        opacity="0.85"
      />
    </>
  ),
  // A falling drop with a smaller one behind it.
  drops: (
    <>
      <path d="M18 2.5s-2.6 3-2.6 4.8a2.6 2.6 0 0 0 5.2 0c0-1.8-2.6-4.8-2.6-4.8z" style={soft} />
      <path d="M10.5 4S4.5 10.6 4.5 15a6 6 0 0 0 12 0C16.5 10.6 10.5 4 10.5 4z" />
      <path
        d="M7.7 15.2a2.9 2.9 0 0 0 2.2 2.9"
        className="stroke-card"
        strokeWidth="1.5"
        strokeLinecap="round"
        opacity="0.85"
      />
    </>
  ),
}

const tints: Record<LabType, string> = {
  tablet: 'bg-medication-blush text-medication-blush-glyph',
  capsule: 'bg-medication-peach text-medication-peach-glyph',
  liquid: 'bg-medication-plum text-medication-plum-glyph',
  inhaler: 'bg-medication-mist text-medication-mist-glyph',
  drops: 'bg-medication-butter text-medication-butter-glyph',
}

/** The 30px tile beside a Type option; `md` is the 46px identity tile, `lg` the dose drawer's. */
export function TypeTile({ type, size = 'sm' }: { type: LabType; size?: 'sm' | 'md' | 'lg' }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'grid shrink-0 place-items-center',
        size === 'sm'
          ? 'size-7.5 rounded-md'
          : size === 'md'
            ? 'size-11.5 rounded-md'
            : 'size-13 rounded-lg',
        tints[type],
      )}
    >
      <svg
        viewBox="0 0 24 24"
        fill="currentColor"
        focusable="false"
        // On the svg itself, so a Select item's own icon size never shrinks it.
        className={size === 'sm' ? 'size-6' : size === 'md' ? 'size-7.5' : 'size-8.5'}
      >
        {glyphs[type]}
      </svg>
    </span>
  )
}
