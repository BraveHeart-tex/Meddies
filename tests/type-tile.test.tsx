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

test.each([
  ['tablet', 'bg-medication-blush', 'text-medication-blush-glyph'],
  ['capsule', 'bg-medication-peach', 'text-medication-peach-glyph'],
  ['liquid', 'bg-medication-plum', 'text-medication-plum-glyph'],
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
  const drawings = (['tablet', 'capsule', 'liquid'] as const).map(
    (type) => render(<TypeTile type={type} />).container.querySelector('svg')?.innerHTML,
  )
  expect(new Set(drawings).size).toBe(3)
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
