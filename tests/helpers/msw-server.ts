import { setupServer } from 'msw/node'

/** The component tests' network. Each test adds its handlers; the setup file resets them. */
export const server = setupServer()
