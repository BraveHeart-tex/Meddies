import { render } from '@testing-library/react'
import type { ReactNode } from 'react'
import { expect, test } from 'vitest'
import type { Medicine } from '../src/features/medicines/contract'
import { MedicationIdentity } from '../src/features/medicines/medication-sub-screen'
import { TypeTile } from '../src/features/medicines/type-tile'
import type { DoseOccurrence } from '../src/features/schedules/contract'
import { DoseDrawer } from '../src/features/schedules/dose-drawer'
import { MedicationRow } from '../src/features/schedules/medication-row'
import { NextDose } from '../src/features/schedules/next-dose'
import { medicineTypeOptions } from '../src/lib/quantity-policy'

test.each([
  ['tablet', 'bg-medication-blush', 'text-medication-blush-glyph'],
  ['capsule', 'bg-medication-peach', 'text-medication-peach-glyph'],
  ['liquid', 'bg-medication-plum', 'text-medication-plum-glyph'],
  ['inhaler', 'bg-medication-mist', 'text-medication-mist-glyph'],
  ['drops', 'bg-medication-butter', 'text-medication-butter-glyph'],
] as const)('the %s Type tile draws its icon on its own tint', (type, tint, glyph) => {
  const { container } = render(<TypeTile type={type} />)
  const tile = container.firstElementChild
  expect(tile).toHaveAttribute('aria-hidden', 'true')
  expect(tile).toHaveClass(tint, glyph)
  const icon = tile?.querySelector('svg')
  expect(icon).toHaveAttribute('viewBox', '0 0 24 24')
  expect(icon?.children.length).toBeGreaterThan(0)
})

test('each Type draws a different icon', () => {
  const drawings = medicineTypeOptions.map(
    ({ value }) => render(<TypeTile type={value} />).container.querySelector('svg')?.innerHTML,
  )
  expect(new Set(drawings).size).toBe(7)
})

// Ids ending 1, 2 and 3 each picked a different tint and shape when tiles came from the id.
const liquids: Medicine[] = ['1', '2', '3'].map((last) => ({
  id: `00000000-0000-4000-8000-00000000000${last}`,
  label: 'Cough syrup',
  strength: null,
  unit: 'liquid',
}))
const dose = (medicine: Medicine): DoseOccurrence => ({
  id: `dose-${medicine.id}`,
  scheduleId: 'schedule',
  medicineId: medicine.id,
  dueAt: '2035-06-15T06:00:00.000Z',
  quantity: 5,
  status: 'Upcoming',
})
const tiles: [string, (medicine: Medicine) => ReactNode, string][] = [
  [
    'Medications row',
    (m) => <MedicationRow medicine={m} scheduleSummary={null} />,
    'bg-medication-plum',
  ],
  ['Medication detail', (m) => <MedicationIdentity medicine={m} />, 'bg-medication-plum'],
  [
    'Up next',
    (m) => (
      <NextDose dose={dose(m)} date="2035-06-15" medicine={m} name={m.label} doseText="5 ml" />
    ),
    'bg-card',
  ],
  [
    'dose drawer',
    (m) => (
      <DoseDrawer
        open
        saving={false}
        triggerId="t"
        type={m.unit}
        title={m.label}
        description=""
        onClose={() => {}}
      >
        {null}
      </DoseDrawer>
    ),
    'bg-medication-plum',
  ],
]

test.each(tiles)('the %s tile shows the Type icon, whatever the id', (_, ui, tint) => {
  const drawings = liquids.map((medicine) => {
    const { baseElement, unmount } = render(ui(medicine))
    const tile = baseElement.querySelector('span[aria-hidden="true"]:has(> svg)')
    // eslint-disable-next-line meddies/no-cosmetic-class-assertions -- a decorative tile's tint is its only observable signal
    expect(tile).toHaveClass(tint, 'text-medication-plum-glyph')
    const html = tile?.outerHTML
    unmount()
    return html
  })
  expect(new Set(drawings).size).toBe(1)
})

test.each([
  ['suppository', 'bg-medication-seafoam', 'text-medication-seafoam-glyph', -35],
  ['ovule', 'bg-medication-periwinkle', 'text-medication-periwinkle-glyph', -20],
] as const)(
  'the %s tile keeps its two-tone glyph at every size and on accent',
  (type, tint, glyph, angle) => {
    for (const [size, dimensions] of [
      ['sm', 'size-7.5'],
      ['md', 'size-11.5'],
      ['lg', 'size-13'],
    ] as const) {
      for (const onAccent of [false, true]) {
        const { container, unmount } = render(
          <TypeTile type={type} size={size} onAccent={onAccent} />,
        )
        const tile = container.firstElementChild
        expect(tile).toHaveAttribute('aria-hidden', 'true')
        expect(tile).toHaveClass(dimensions, onAccent ? 'bg-card' : tint, glyph)
        expect(tile?.querySelector('svg')).toHaveAttribute('viewBox', '0 0 24 24')
        const drawing = tile?.querySelector('svg > g')
        expect(drawing).toHaveAttribute('transform', `rotate(${angle} 12 12)`)
        expect(drawing?.children[1]).toHaveStyle({ opacity: '0.45' })
        // eslint-disable-next-line meddies/no-cosmetic-class-assertions -- highlights use the card token through this class
        expect(drawing?.children[2]).toHaveClass('stroke-card')
        unmount()
      }
    }
  },
)
