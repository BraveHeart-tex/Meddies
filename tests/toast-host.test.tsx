import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test } from 'vitest'
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
