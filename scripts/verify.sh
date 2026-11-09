#!/usr/bin/env bash
set -euo pipefail
pnpm lint
pnpm format:check
pnpm typecheck
# Locally, reuse a build no input has changed since (often the journey wrapper's, which also
# builds with --webpack). With CI set it always builds. The Verify workflow runs its own jobs;
# this script is the local and manual-recovery path.
node --input-type=module -e "
  import { productionBuild } from './scripts/production-build.mjs'
  import { spawnSync } from 'node:child_process'
  console.log(await productionBuild({run(command, args) {
    const result = spawnSync(command, args, {stdio: 'inherit'})
    if (result.status !== 0) process.exit(result.status ?? 1)
  }}))
"
pnpm test
