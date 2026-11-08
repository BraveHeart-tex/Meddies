# Tests

`pnpm test` builds the Worker bundle, then runs the Vitest projects in
`vitest.config.mts` (`unit`, `component`, `integration`). The `integration` project runs the
Worker bundle (`.worker-build`) in local workerd/D1; its auth and design-lab suites also start
`next start`, so they need a production build in `.next`. The lab suite additionally
checks `next dev` HTTP behavior.

```sh
pnpm test:unit                           # unit and component projects, no Worker build
pnpm test:unit tests/http.test.ts       # one file
pnpm test:unit medications-list          # files matching a name
pnpm test:integration                    # builds the Worker, then integration
```

Tests import `test` and hooks from `vitest` and use synthetic configuration and
identities. A test that never settles fails on its project's timeout; pass a per-test
timeout only when the test's own deadlines are longer, as the dev-stack tests do.

Browser journeys: [browser/README.md](browser/README.md). What each level should prove:
[verification](../docs/verification.md#cheapest-proof).

## Component tests

Component tests prove a screen's loading, refresh and failure states in seconds, without a
browser, server or Worker. They render the real feature component with React Testing
Library and jest-dom matchers. [`medications-list.test.tsx`](medications-list.test.tsx) is
the reference.

- **Network:** MSW (`helpers/msw-server.ts`) answers at the network layer. Each test adds
  its handlers with `server.use`, counting reads where needed. An unhandled request fails
  the test.
- **Query:** each test creates a client with `createQueryClient()` (the session client
  stays out of tests) and seeds cached data with `setQueryData` and `updatedAt`.
- **Next.js:** mock `next/navigation` with `vi.mock`.
- **Time:** `vi.useFakeTimers({ shouldAdvanceTime: true })`; wrap
  `vi.advanceTimersByTimeAsync` in `act` and pass it to `userEvent.setup({ advanceTimers })`.
- **Focus and reconnect:** dispatch real DOM events on `window` (`focus` or
  `visibilitychange`, then `offline` and `online`) so the app's listener wiring is proven.
- `helpers/component-setup.ts` unmounts, resets MSW handlers and restores real timers after
  each test.
