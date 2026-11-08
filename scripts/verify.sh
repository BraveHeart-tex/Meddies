#!/usr/bin/env bash
set -euo pipefail
pnpm lint
pnpm format:check
pnpm typecheck
# Locally, reuse a build no input has changed since (often the journey wrapper's, which also
# builds with --webpack). With CI set it always builds. The Verify workflow runs its own jobs;
# this script is the local and manual-recovery path.
stale=$(node --input-type=module -e "
  import { staleBuildReason } from './tests/helpers/journey-build.mjs'
  console.log((await staleBuildReason(process.cwd())) ?? '')
")
if [[ -z "${CI:-}" && -z "$stale" ]]; then
  echo '[verify] Next.js build fresh, skipped'
else
  pnpm build "$@"
fi
pnpm test
