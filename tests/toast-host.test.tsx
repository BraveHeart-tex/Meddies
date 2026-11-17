import { act, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { createToastManager, Toaster } from '../src/components/ui/toast'

// The Toast host's Dismiss and swipe (#376). Base UI owns the 40px threshold; these
// cases catch a lost close button, a narrowed swipeDirection, or a short swipe that dismisses.

const title = 'Schedule saved'

function showToast() {
  const manager = createToastManager()
  render(<Toaster toastManager={manager} />)
  act(() => {
    manager.add({ title, type: 'success', timeout: 0 })
  })
  return screen.getByRole('dialog', { name: title })
}

function swipe(element: HTMLElement, dx: number, dy: number) {
  const start = { pointerId: 1, button: 0, pointerType: 'mouse', clientX: 200, clientY: 400 }
  fireEvent.pointerDown(element, start)
  fireEvent.pointerMove(element, { ...start, clientX: 200, clientY: 400 })
  for (const step of [0.25, 0.5, 0.75, 1]) {
    fireEvent.pointerMove(element, {
      ...start,
      clientX: start.clientX + dx * step,
      clientY: start.clientY + dy * step,
    })
  }
  fireEvent.pointerUp(document, {
    ...start,
    clientX: start.clientX + dx,
    clientY: start.clientY + dy,
  })
}

test('every Toast renders Dismiss, which closes it with the opacity-only exit', async () => {
  const user = userEvent.setup()
  const toastElement = showToast()
  // Base UI exposes Close once pointer or focus expands the stack.
  await user.hover(toastElement)
  const dismiss = screen.getByRole('button', { name: 'Dismiss' })
  // eslint-disable-next-line meddies/no-cosmetic-class-assertions -- the 44px target is the criterion
  expect(dismiss).toHaveClass('size-11')

  await user.click(dismiss)

  // No swipe direction selects the plain fade exit rather than a swipe slide.
  expect(toastElement).not.toHaveAttribute('data-swipe-direction')
  expect(screen.queryByRole('dialog', { name: title })).not.toBeInTheDocument()
})

test.each([
  ['left', -60, 0],
  ['right', 60, 0],
  ['down', 0, 60],
] as const)('a swipe %s past 40px dismisses the Toast', (direction, dx, dy) => {
  const toastElement = showToast()

  swipe(toastElement, dx, dy)

  expect(toastElement).toHaveAttribute('data-swipe-direction', direction)
  expect(screen.queryByRole('dialog', { name: title })).not.toBeInTheDocument()
})

test('a swipe up does not dismiss the Toast', () => {
  const toastElement = showToast()

  swipe(toastElement, 0, -60)

  expect(screen.getByRole('dialog', { name: title })).toBe(toastElement)
})

test('a swipe of 40px springs back and keeps the Toast', () => {
  const toastElement = showToast()

  swipe(toastElement, 40, 0)

  expect(screen.getByRole('dialog', { name: title })).toBe(toastElement)
  expect(toastElement).not.toHaveAttribute('data-swiping')
  expect(toastElement).not.toHaveAttribute('data-swipe-direction')
})

// #378 stack and timer (371·A8, A9). Base UI owns expansion and pausing; these cases catch a lost
// `limit`, a reading time that ignores the detail line, or a stack that no longer pauses.

function host() {
  const manager = createToastManager()
  render(<Toaster toastManager={manager} />)
  const add = (title: string, description?: string) =>
    act(() => {
      manager.add({ title, description, type: 'success' })
    })
  const toastOf = (name: string) => screen.getByRole('dialog', { name })
  return { add, toastOf }
}

const isBehind = (toastElement: HTMLElement) =>
  toastElement.querySelector('[data-slot="toast-content"]')?.hasAttribute('data-behind')

test('two Toasts collapse with the older behind, and a tap expands them', async () => {
  const user = userEvent.setup()
  const { add, toastOf } = host()
  add('Fixed details saved')
  add('Schedule saved for Amoxicillin.')

  expect(isBehind(toastOf('Fixed details saved'))).toBe(true)
  expect(isBehind(toastOf('Schedule saved for Amoxicillin.'))).toBe(false)
  expect(toastOf('Fixed details saved')).not.toHaveAttribute('data-expanded')

  await user.pointer({ keys: '[TouchA]', target: toastOf('Schedule saved for Amoxicillin.') })

  expect(toastOf('Fixed details saved')).toHaveAttribute('data-expanded')
  expect(toastOf('Schedule saved for Amoxicillin.')).toHaveAttribute('data-expanded')
})

test('keyboard focus expands the stack', async () => {
  const user = userEvent.setup()
  const { add, toastOf } = host()
  add('Fixed details saved')
  add('Schedule saved for Amoxicillin.')

  await user.keyboard('{F6}')

  expect(toastOf('Fixed details saved')).toHaveAttribute('data-expanded')
})

test('expanded, each Toast closes on its own', async () => {
  const user = userEvent.setup()
  const { add, toastOf } = host()
  add('Fixed details saved')
  add('Schedule saved for Amoxicillin.')
  await user.hover(toastOf('Schedule saved for Amoxicillin.'))

  const older = toastOf('Fixed details saved')
  await user.click(within(older).getByRole('button', { name: 'Dismiss' }))

  expect(screen.queryByRole('dialog', { name: 'Fixed details saved' })).not.toBeInTheDocument()
  expect(toastOf('Schedule saved for Amoxicillin.')).toBeVisible()
})

test('a third Toast drops the oldest', () => {
  const { add, toastOf } = host()
  add('First saved')
  add('Second saved')
  add('Third saved')

  expect(document.querySelector('[data-limited]')).toHaveTextContent('First saved')
  expect(toastOf('Second saved')).not.toHaveAttribute('data-limited')
  expect(toastOf('Third saved')).not.toHaveAttribute('data-limited')
})

describe('reading time', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  test.each([
    ['without a detail line', undefined, 4000],
    ['with a detail line', 'Next dose: today at 20:00.', 6000],
  ] as const)('a Toast %s stays %d ms', (_, detail, ms) => {
    const { add } = host()
    add('Schedule saved for Amoxicillin.', detail)

    act(() => vi.advanceTimersByTime(ms - 100))
    expect(screen.getByRole('dialog', { name: 'Schedule saved for Amoxicillin.' })).toBeVisible()
    act(() => vi.advanceTimersByTime(200))
    expect(
      screen.queryByRole('dialog', { name: 'Schedule saved for Amoxicillin.' }),
    ).not.toBeInTheDocument()
  })

  test('a touch pauses the timer until a touch outside the stack', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    const { add, toastOf } = host()
    add('Fixed details saved')

    await user.pointer({ keys: '[TouchA]', target: toastOf('Fixed details saved') })
    act(() => vi.advanceTimersByTime(10_000))
    expect(toastOf('Fixed details saved')).toBeVisible()

    await user.pointer({ keys: '[TouchA]', target: document.body })
    act(() => vi.advanceTimersByTime(4_100))
    expect(screen.queryByRole('dialog', { name: 'Fixed details saved' })).not.toBeInTheDocument()
  })

  test('focus pauses the timer', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    const { add, toastOf } = host()
    add('Fixed details saved')

    await user.keyboard('{F6}')
    act(() => vi.advanceTimersByTime(10_000))
    expect(toastOf('Fixed details saved')).toBeVisible()
  })

  test('a set timeout keeps its own', () => {
    const manager = createToastManager()
    render(<Toaster toastManager={manager} />)
    act(() => {
      manager.add({ title: 'That might not have saved.', description: 'Try again.', timeout: 0 })
    })
    act(() => vi.advanceTimersByTime(60_000))
    expect(screen.getByRole('dialog', { name: 'That might not have saved.' })).toBeVisible()
  })
})
