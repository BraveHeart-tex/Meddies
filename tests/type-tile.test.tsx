import { render } from '@testing-library/react'
import { expect, test } from 'vitest'
import { TypeTile } from '../src/features/medicines/type-tile'

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
