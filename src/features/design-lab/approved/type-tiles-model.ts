// #483 lab-only values: the approved Suppository and Ovule Type tiles (Direction B). Nothing here is
// imported outside `approved/`; #481 owns the production Types, tints and glyphs.

export type NewType = 'suppository' | 'ovule'
export type ExistingType = 'tablet' | 'capsule' | 'liquid' | 'inhaler' | 'drops'

export const existingTypes: readonly { value: ExistingType; label: string }[] = [
  { value: 'tablet', label: 'Tablet' },
  { value: 'capsule', label: 'Capsule' },
  { value: 'liquid', label: 'Liquid' },
  { value: 'inhaler', label: 'Inhaler' },
  { value: 'drops', label: 'Drops' },
]

export const newTypes: readonly { value: NewType; label: string }[] = [
  { value: 'suppository', label: 'Suppository' },
  { value: 'ovule', label: 'Ovule' },
]

/** Approved tint and glyph color per new Type, with the literal tile classes Tailwind scans. */
export const newTints: Record<
  NewType,
  { name: string; tint: string; glyph: string; tile: string; onAccent: string }
> = {
  suppository: {
    name: 'Seafoam',
    tint: '#d9eeea',
    glyph: '#55a593',
    tile: 'bg-[#d9eeea] text-[#55a593]',
    onAccent: 'bg-card text-[#55a593]',
  },
  ovule: {
    name: 'Periwinkle',
    tint: '#e1e6f8',
    glyph: '#7389d1',
    tile: 'bg-[#e1e6f8] text-[#7389d1]',
    onAccent: 'bg-card text-[#7389d1]',
  },
}
