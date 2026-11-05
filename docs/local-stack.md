# Local app and Worker stack

Use this workflow when a task needs both Next.js and local Worker/D1. Run the
commands from the repository root.

Copy `.env.example` to `.env.local` and `worker/.dev.vars.example` to
`worker/.dev.vars`. Set an independent `MEDICINES_WORKER_SECRET`
of at least 32 characters in both files. Google sign-in values are optional for
local stack startup; sign-in needs the configured Google OAuth values.

```sh
pnpm dev:stack start
pnpm dev:stack status
pnpm dev:stack stop
```

`start` returns once both services are ready and prints their URLs and log paths.
If startup fails, check the reported stage and its log, fix the cause, and rerun
`start`. Run `stop` when finished.

The stack uses `http://127.0.0.1:3000` for Next.js and
`http://127.0.0.1:8787` for Wrangler. It applies migrations to the checkout's
local D1 store, then starts the Worker and app. Wrangler keeps its default
`worker/.wrangler/state` data between runs. One stack runs per checkout. Port
conflicts fail safely; the command never terminates an unrelated listener.
Lifecycle state and logs live in ignored `.dev-stack/`. The stack is for local
development only and never targets production.
