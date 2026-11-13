import { render, screen, within } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import { AppHeader, AppHeaderSkeleton } from '../src/components/layout/app-header'
import { AppShell } from '../src/components/layout/app-shell'

const navigation = vi.hoisted(() => ({ pathname: '/' }))
vi.mock('next/navigation', () => ({ usePathname: () => navigation.pathname }))

function tabs() {
  return within(screen.getByRole('navigation', { name: 'Primary' })).getAllByRole('link')
}

test('the bottom bar holds four tabs and Settings is the current page on its tab', () => {
  navigation.pathname = '/settings'
  render(
    <AppShell>
      <AppHeader title="Settings" />
    </AppShell>,
  )

  expect(tabs().map((tab) => [tab.textContent, tab.getAttribute('href')])).toEqual([
    ['Today', '/'],
    ['Medications', '/medications'],
    ['History', '/history'],
    ['Settings', '/settings'],
  ])
  expect(screen.getByRole('link', { name: 'Settings' })).toHaveAttribute('aria-current', 'page')
  expect(screen.getAllByRole('link', { current: 'page' })).toHaveLength(1)
})

test('page headers and the header skeleton carry only page actions, never Settings', () => {
  navigation.pathname = '/medications'
  render(
    <>
      <AppHeader title="Medications" action={<button type="button">Add</button>} />
      <AppHeaderSkeleton />
    </>,
  )

  expect(screen.getByRole('button', { name: 'Add' })).toBeVisible()
  expect(screen.queryByRole('link', { name: 'Settings' })).toBeNull()
})
