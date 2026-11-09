import { render, screen } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import { DoseStatusBadge } from '../src/features/schedules/dose-status-badge'
import { QuantityStepper } from '../src/components/quantity-stepper'
import { SettingsLink } from '../src/components/layout/app-header'

vi.mock('next/navigation', () => ({ usePathname: () => '/' }))

test.each([
  ['Upcoming', 'Scheduled'],
  ['Due now', 'Due now'],
  ['Not logged', 'Not logged'],
  ['Taken', 'Taken'],
  ['Skipped', 'Skipped'],
] as const)('%s retains visible status text and a decorative icon', (status, label) => {
  render(<DoseStatusBadge status={status} />)
  const badge = screen.getByText(label)
  expect(badge).toBeVisible()
  expect(badge.querySelector('svg[aria-hidden="true"]')).toBeInTheDocument()
})

test('icon-only quantity controls and Settings retain accessible names', () => {
  render(
    <>
      <SettingsLink />
      <QuantityStepper
        id="amount"
        label="Amount"
        unit="tablet"
        value="2"
        onValueChange={() => {}}
      />
    </>,
  )
  expect(screen.getByRole('link', { name: 'Settings' })).toHaveAttribute('href', '/settings')
  for (const name of ['Fewer: Amount', 'More: Amount']) {
    expect(screen.getByRole('button', { name })).toContainHTML('aria-hidden="true"')
  }
})

test.each([
  [false, 'Saving · Taken'],
  [true, 'Might not have saved'],
] as const)('save feedback retains text and an icon (unconfirmed: %s)', (unconfirmed, label) => {
  render(<DoseStatusBadge status="Taken" pending={{ id: 'save', outcome: 'Taken', unconfirmed }} />)
  expect(screen.getByText(label)).toBeVisible()
  expect(screen.getByText(label).querySelector('svg[aria-hidden="true"]')).toBeInTheDocument()
})
