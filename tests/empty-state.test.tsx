import { render, screen } from '@testing-library/react'
import { Pill } from 'lucide-react'
import { createRef } from 'react'
import { expect, test } from 'vitest'
import { EmptyState } from '../src/components/ui/empty-state'

test('renders the title, body and action, with a decorative icon', () => {
  const { container } = render(
    <EmptyState
      icon={Pill}
      title="No medications here yet"
      body="Add your first one whenever you're ready."
      action={<a href="/add">Add medication</a>}
    />,
  )
  expect(screen.getByRole('heading', { name: 'No medications here yet' })).toBeVisible()
  expect(screen.getByText("Add your first one whenever you're ready.")).toBeVisible()
  expect(screen.getByRole('link', { name: 'Add medication' })).toBeVisible()
  expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
  expect(screen.queryByRole('img')).not.toBeInTheDocument()
})

test('leaves out the action area when there is no action', () => {
  const { container } = render(<EmptyState icon={Pill} title="Nothing yet" body="Check back." />)
  expect(screen.queryByRole('link')).not.toBeInTheDocument()
  expect(container.querySelector('[data-slot="empty-state-action"]')).toBeNull()
})

test('the title keeps its heading level and can receive focus', () => {
  const titleRef = createRef<HTMLHeadingElement>()
  render(
    <EmptyState
      icon={Pill}
      title="Nothing scheduled"
      body="Use the arrows."
      titleAs="h2"
      titleRef={titleRef}
    />,
  )
  const heading = screen.getByRole('heading', { level: 2, name: 'Nothing scheduled' })
  titleRef.current?.focus()
  expect(heading).toHaveFocus()
})
