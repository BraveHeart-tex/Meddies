#!/usr/bin/env bash
set -euo pipefail
pnpm lint
pnpm format:check
pnpm typecheck
pnpm build
pnpm test
