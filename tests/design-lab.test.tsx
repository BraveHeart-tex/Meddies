import { render, screen, within } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import { designFrames } from '../src/features/design-lab/frames'

vi.mock('next/navigation', () => ({
  usePathname: () => '/lab/109-l1',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}))

// Every registered frame renders in jsdom, so a frame needing a browser API jsdom lacks fails
// in the design ticket that adds it, not in the build ticket that reuses its parts.
test.each(designFrames.map((frame) => [frame.citation, frame] as const))(
  '%s renders',
  (_citation, frame) => {
    render(frame.render())
    expect(document.body).not.toBeEmptyDOMElement()
  },
)

test('109·L1 renders the cold launch with one status and the real navigation', () => {
  const frame = designFrames.find((entry) => entry.slug === '109-l1')!
  render(frame.render())
  expect(frame.citation).toBe('109·L1')
  expect(screen.getAllByRole('status')).toHaveLength(1)
  expect(screen.getByRole('status')).toHaveTextContent('Opening Meddies')
  expect(screen.getAllByRole('main')).toHaveLength(1)
  expect(screen.getAllByRole('navigation', { name: 'Primary' })).toHaveLength(1)
  for (const name of ['Today', 'Medications', 'History', 'Settings'])
    expect(screen.getByRole('link', { name })).toBeInTheDocument()
})

test('238·A5 selects the Settings tab and its title stands alone', () => {
  const frame = designFrames.find((entry) => entry.slug === '238-a5')!
  render(frame.render())
  expect(screen.getByRole('link', { name: 'Settings' })).toHaveAttribute('aria-current', 'page')
  expect(screen.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible()
})

const renderFrame = (slug: string) =>
  render(designFrames.find((entry) => entry.slug === slug)!.render())

test('241·A5 shows the Unscheduled dose in Logged by time, marked and never Up next', () => {
  renderFrame('241-a5')
  // Later today's 20:00, then Logged by time: 08:00 taken, 09:30 Unscheduled.
  const rows = within(screen.getByRole('list', { name: "Today's doses" }))
    .getAllByRole('listitem')
    .map((row) => row.textContent ?? '')
  expect(rows).toHaveLength(3)
  expect(rows[1]).toMatch(/^08:00.*Magnesium/)
  expect(rows[2]).toMatch(/^09:30.*Ibuprofen.*Not on a schedule/)
  expect(screen.getByRole('heading', { name: 'Logged · 2' })).toBeVisible()
  expect(
    screen.getByRole('heading', { name: 'Up next' }).closest('[data-slot=card]'),
  ).toHaveTextContent('Magnesium')
})

test('241·A6 lists only Unscheduled doses instead of the empty state', () => {
  renderFrame('241-a6')
  expect(screen.getByRole('heading', { name: 'Logged · 2' })).toBeVisible()
  expect(screen.queryByText('Nothing to take today')).not.toBeInTheDocument()
})

test('241·A1 offers Log a dose without a schedule and lists no past doses', () => {
  renderFrame('241-a1')
  expect(screen.getByRole('link', { name: 'Log a dose' })).toBeVisible()
  expect(screen.queryByText(/Not on a schedule/)).not.toBeInTheDocument()
})

test('241 save messages name the day only when it is not today', async () => {
  const { savedMessage, unscheduled, at, ibuprofen } =
    await import('../src/features/design-lab/unscheduled-model')
  const { magnesium } = await import('../src/features/design-lab/lab-fixtures')
  expect(
    savedMessage(ibuprofen, unscheduled(1, ibuprofen, at('2026-11-09', '10:00')), '2026-11-09'),
  ).toBe('Ibuprofen · taken at 10:00, 1 tablet')
  expect(
    savedMessage(
      magnesium,
      unscheduled(2, magnesium, at('2026-11-08', '23:30'), 0.5),
      '2026-11-09',
    ),
  ).toBe('Magnesium · taken at 23:30 on Sun 8 Nov, ½ tablet')
})
