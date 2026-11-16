import { GlyphTile, typeGlyphs, typeTints, type TypeTileSize } from '@/features/medicines/type-tile'
import type { LabType } from './medication-types-model'

// #265 lab tiles draw the production Type icons and tints (#267 moved Inhaler and Drops there).

/** The 30px tile beside a Type option; `md` is the 46px identity tile, `lg` the dose drawer's. */
export function TypeTile({ type, size = 'sm' }: { type: LabType; size?: TypeTileSize }) {
  return <GlyphTile glyph={typeGlyphs[type]} tint={typeTints[type]} size={size} />
}
