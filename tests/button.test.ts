import { expect, test } from 'vitest'
import { buttonVariants } from '../src/components/ui/button'

test('outline variant keeps its strong border when extra classes are supplied', () => {
  const classes = buttonVariants({ variant: 'outline', className: 'mt-2 justify-self-start' })

  expect(classes).toContain('border-border-strong')
  expect(classes).not.toContain('border-transparent')
})
