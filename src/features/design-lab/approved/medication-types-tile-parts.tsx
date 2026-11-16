import type { ReactNode } from 'react'
import { GlyphTile, typeGlyphs, typeTints, type TypeTileSize } from '@/features/medicines/type-tile'
import type { LabType } from './medication-types-model'

// #265 Type icons for Types not yet built (#267): Inhaler and Drops extend the production
// Type tile (`type-tile.tsx`) with the same two-tone drawing rules.
const soft = { opacity: 0.45 }

const glyphs: Record<LabType, ReactNode> = {
  ...typeGlyphs,
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
  ...typeTints,
  inhaler: 'bg-medication-mist text-medication-mist-glyph',
  drops: 'bg-medication-butter text-medication-butter-glyph',
}

/** The 30px tile beside a Type option; `md` is the 46px identity tile, `lg` the dose drawer's. */
export function TypeTile({ type, size = 'sm' }: { type: LabType; size?: TypeTileSize }) {
  return <GlyphTile glyph={glyphs[type]} tint={tints[type]} size={size} />
}
