import type { ReactNode } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { GlyphTile, TypeTile, type TypeTileSize } from '@/features/medicines/type-tile'
import { existingTypes, newTints, newTypes, type NewType } from './type-tiles-model'

// #483 Direction B (483·B1-B3): the approved Suppository and Ovule glyphs, one form split into
// solid and soft like the Capsule, in the #265 two-tone style: solid glyph color, soft tone at
// 45%, card-colored highlights, 24px grid, rounded joins.
const soft = { opacity: 0.45 }
const r = (n: number) => Math.round(n * 100) / 100

/** A bullet's rounded nose at `top` and its body down to `base`; `bulletBase` draws the rest. */
function bulletPath(cx: number, top: number, bottom: number, half: number, base: number) {
  const shoulder = top + (bottom - top) * 0.5
  const k = (shoulder - top) * 0.62
  const end = `V${base}H${r(cx - half)}`
  return `M${r(cx - half)} ${r(shoulder)}C${r(cx - half)} ${r(shoulder - k)} ${r(cx - half * 0.42)} ${top} ${cx} ${top}C${r(cx + half * 0.42)} ${top} ${r(cx + half)} ${r(shoulder - k)} ${r(cx + half)} ${r(shoulder)}${end}z`
}

/** The soft base band below `from` of a bullet drawn by `bulletPath`. */
function bulletBase(cx: number, from: number, bottom: number, half: number) {
  return `M${r(cx - half)} ${from}H${r(cx + half)}V${r(bottom - 0.9)}Q${r(cx + half)} ${bottom} ${r(cx + half - 0.9)} ${bottom}H${r(cx - half + 0.9)}Q${r(cx - half)} ${bottom} ${r(cx - half)} ${r(bottom - 0.9)}z`
}

/** An egg, broad end down; `part` draws the cap above or the base below its widest line. */
function eggPath(cx: number, top: number, bottom: number, half: number, part: 'cap' | 'base') {
  const h = bottom - top
  const wy = r(top + h * 0.6)
  const right = `C${r(cx + half * 0.62)} ${top} ${r(cx + half)} ${r(top + h * 0.36)} ${r(cx + half)} ${wy}`
  const lower = `C${r(cx + half)} ${r(top + h * 0.86)} ${r(cx + half * 0.55)} ${bottom} ${cx} ${bottom}C${r(cx - half * 0.55)} ${bottom} ${r(cx - half)} ${r(top + h * 0.86)} ${r(cx - half)} ${wy}`
  const left = `C${r(cx - half)} ${r(top + h * 0.36)} ${r(cx - half * 0.62)} ${top} ${cx} ${top}`
  return part === 'cap'
    ? `M${cx} ${top}${right}H${r(cx - half)}${left}z`
    : `M${r(cx + half)} ${wy}${lower}z`
}

const highlight = (d: string) => (
  <path
    d={d}
    className="stroke-card"
    fill="none"
    strokeWidth="1.4"
    strokeLinecap="round"
    opacity="0.85"
  />
)

/** Glyph per new Type. */
export const newGlyphs: Record<NewType, ReactNode> = {
  // A bullet tilted against the Capsule, solid nose and body over a soft base.
  suppository: (
    <g transform="rotate(-35 12 12)">
      <path d={bulletPath(12, 2.5, 21.5, 4.4, 15.5)} />
      <path d={bulletBase(12, 15.5, 21.5, 4.4)} style={soft} />
      {highlight('M9.6 12.2c0-1.6.4-3 1.1-4.1')}
    </g>
  ),
  // An egg, solid above its widest line and soft below.
  ovule: (
    <g transform="rotate(-20 12 12)">
      <path d={eggPath(12, 2.5, 21.5, 7, 'cap')} />
      <path d={eggPath(12, 2.5, 21.5, 7, 'base')} style={soft} />
      {highlight('M7.7 11.4c.2-2.2 1.1-4 2.5-5.1')}
    </g>
  ),
}

const sizes: readonly TypeTileSize[] = ['sm', 'md', 'lg']

function NewTile({
  type,
  size,
  onAccent,
}: {
  type: NewType
  size: TypeTileSize
  onAccent: boolean
}) {
  const tint = newTints[type]
  return (
    <GlyphTile glyph={newGlyphs[type]} tint={onAccent ? tint.onAccent : tint.tile} size={size} />
  )
}

function SheetRow({
  label,
  note,
  children,
}: {
  label: string
  note?: string
  children: ReactNode
}) {
  return (
    <li className="flex min-h-15 items-center gap-3 not-first:border-t not-first:border-border">
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="text-base font-extrabold">{label}</span>
        {note && <span className="text-caption text-muted-foreground">{note}</span>}
      </div>
      <div className="flex shrink-0 items-center gap-3">{children}</div>
    </li>
  )
}

/** Every Type at every TypeTile size, the two new Types first, on the card or the accent card. */
export function TileSheet({ onAccent = false }: { onAccent?: boolean }) {
  return (
    <main className="flex min-h-dvh flex-col gap-5 bg-background px-5 py-6">
      <h1 className="text-title font-extrabold">Type tiles</h1>
      <Card variant={onAccent ? 'accent' : 'default'}>
        <CardHeader>
          <CardTitle className="text-label leading-none tracking-eyebrow uppercase">
            <h2>{onAccent ? 'On the accent card' : 'On the card'}</h2>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="flex flex-col">
            {newTypes.map((type) => (
              <SheetRow
                key={type.value}
                label={type.label}
                note={`New · ${newTints[type.value].name}`}
              >
                {sizes.map((size) => (
                  <NewTile key={size} type={type.value} size={size} onAccent={onAccent} />
                ))}
              </SheetRow>
            ))}
            {existingTypes.map((type) => (
              <SheetRow key={type.value} label={type.label}>
                {sizes.map((size) => (
                  <TypeTile key={size} type={type.value} size={size} onAccent={onAccent} />
                ))}
              </SheetRow>
            ))}
          </ul>
        </CardContent>
      </Card>
    </main>
  )
}

/** The 30px tile beside a Type option, for the Type menu. */
export function MenuTile({ type }: { type: string }) {
  if (type === 'suppository' || type === 'ovule')
    return <NewTile type={type} size="sm" onAccent={false} />
  return <TypeTile type={type as (typeof existingTypes)[number]['value']} />
}
