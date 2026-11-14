import * as React from 'react'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'
import { TimePicker } from '@/components/ui/time-picker'
import type { PickerHandle } from '@/components/ui/date-picker'

// Regression: the option elements are shared across renders and pickers, so a selection or
// highlight could leak between pickers or stop updating after a controlled reset.
test('shared options keep independent selection, partial values, reset, focus and blur', async () => {
  const user = userEvent.setup()
  const blur = vi.fn()
  const handle = React.createRef<PickerHandle>()
  function Harness() {
    const [first, setFirst] = React.useState('')
    const [second, setSecond] = React.useState('09:30')
    return (
      <>
        <p id="error">Choose a time.</p>
        <TimePicker
          now={() => new Date()}
          ref={handle}
          id="first"
          label="First"
          value={first}
          onValueChange={setFirst}
          onBlur={blur}
          required
          aria-invalid
          aria-describedby="error"
        />
        <TimePicker
          now={() => new Date()}
          id="second"
          label="Second"
          value={second}
          onValueChange={setSecond}
        />
        <TimePicker
          now={() => new Date()}
          id="disabled"
          label="Disabled"
          value="10:45"
          onValueChange={() => {}}
          disabled
        />
        <output aria-label="First value">{first}</output>
        <button onClick={() => setFirst('')}>Clear</button>
      </>
    )
  }
  render(<Harness />)
  const first = (part: string) => screen.getByRole('combobox', { name: `First ${part}` })
  const second = (part: string) => screen.getByRole('combobox', { name: `Second ${part}` })
  const pick = async (trigger: HTMLElement, value: string) => {
    await user.click(trigger)
    await user.click(await screen.findByRole('option', { name: value }))
    await waitFor(() => expect(screen.queryByRole('listbox')).not.toBeInTheDocument())
  }
  expect(first('hour')).toHaveAccessibleDescription('Choose a time.')
  expect(first('minute')).toHaveAttribute('aria-invalid', 'true')
  expect(first('hour')).toHaveAttribute('aria-required', 'true')
  expect(screen.getByRole('combobox', { name: 'Disabled hour' })).toBeDisabled()
  expect(screen.getByRole('combobox', { name: 'Disabled minute' })).toBeDisabled()
  await pick(first('hour'), '08')
  expect(screen.getByLabelText('First value')).toHaveTextContent('08:')
  expect(first('hour')).toHaveFocus()
  act(() => handle.current?.focus())
  expect(first('minute')).toHaveFocus()
  expect(blur).not.toHaveBeenCalled()
  await pick(first('minute'), '15')
  expect(screen.getByLabelText('First value')).toHaveTextContent('08:15')
  await user.keyboard('{Enter}')
  expect(await screen.findByRole('option', { name: '15' })).toHaveAttribute('aria-selected', 'true')
  await user.keyboard('{ArrowDown}{Enter}')
  await waitFor(() => expect(first('minute')).toHaveTextContent('16'))
  expect(first('minute')).toHaveFocus()
  expect(blur).not.toHaveBeenCalled()
  await pick(second('minute'), '45')
  expect(second('hour')).toHaveTextContent('09')
  expect(first('minute')).toHaveTextContent('16')
  await user.click(first('minute'))
  expect(await screen.findByRole('option', { name: '16' })).toHaveAttribute('aria-selected', 'true')
  expect(screen.getByRole('option', { name: '45' })).toHaveAttribute('aria-selected', 'false')
  await user.keyboard('{Escape}')
  await waitFor(() => expect(first('minute')).toHaveFocus())
  await user.click(screen.getByRole('button', { name: 'Clear' }))
  await waitFor(() => expect(blur).toHaveBeenCalled())
  expect(first('hour')).toHaveTextContent('HH')
  expect(first('minute')).toHaveTextContent('MM')
  expect(second('minute')).toHaveTextContent('45')
  await pick(first('minute'), '05')
  expect(screen.getByLabelText('First value')).toHaveTextContent(':05')
  act(() => handle.current?.focus())
  expect(first('hour')).toHaveFocus()
})

// Regression: opening must reveal the current controlled part (or Istanbul hour), without
// turning that scroll-only fallback into a selection. jsdom cannot prove popup geometry.
test('opening reveals chosen parts and a fresh Istanbul hour without selecting it', async () => {
  vi.stubEnv('TZ', 'Pacific/Kiritimati')
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2035-06-15T20:30:00Z'))
  const scroll = vi.fn()
  const original = Element.prototype.scrollIntoView
  Element.prototype.scrollIntoView = scroll
  const change = vi.fn()
  const user = userEvent.setup()
  const picker = (value: string) => (
    <TimePicker
      now={() => new Date()}
      id="opening"
      label="Opening"
      value={value}
      onValueChange={change}
    />
  )
  const { rerender } = render(picker('19:57'))
  const hour = screen.getByRole('combobox', { name: 'Opening hour' })
  const minute = screen.getByRole('combobox', { name: 'Opening minute' })
  const open = async (trigger: HTMLElement, target: string, keyboard = false) => {
    scroll.mockClear()
    if (keyboard) {
      trigger.focus()
      await user.keyboard('{Enter}')
    } else await user.click(trigger)
    const option = await screen.findByRole('option', { name: target })
    await waitFor(() => expect(scroll.mock.contexts).toContain(option))
  }
  const dismiss = async () => {
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('listbox')).not.toBeInTheDocument())
  }
  try {
    await open(hour, '19')
    await dismiss()
    await open(minute, '57', true)
    expect(screen.getAllByRole('option')).toHaveLength(60)
    expect(screen.getByRole('option', { name: '00' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: '59' })).toBeInTheDocument()
    await dismiss()
    rerender(picker('04:03'))
    await open(hour, '04', true)
    await dismiss()
    await open(minute, '03')
    await dismiss()
    // The device is already at 10:30 tomorrow; Istanbul is still at 23:30.
    expect(new Date().getHours()).toBe(10)
    rerender(picker(''))
    await open(hour, '23')
    expect(screen.getByRole('option', { name: '23' })).toHaveAttribute('aria-selected', 'false')
    await dismiss()
    expect(hour).toHaveTextContent('HH')
    expect(minute).toHaveTextContent('MM')
    vi.setSystemTime(new Date('2035-06-15T21:30:00Z'))
    rerender(picker(':42'))
    await open(hour, '00', true)
    await dismiss()
    expect(hour).toHaveTextContent('HH')
    expect(minute).toHaveTextContent('42')
    expect(change).not.toHaveBeenCalled()
  } finally {
    Element.prototype.scrollIntoView = original
    vi.unstubAllEnvs()
  }
})
