#!/usr/bin/env bash
set -Eeuo pipefail

stage=preflight
report_failure() {
  printf 'Release %s failed at %s. Stop; follow docs/deployment.md recovery.\n' "${GITHUB_SHA:-unknown}" "$stage" >&2
  if [[ -n "${GITHUB_STEP_SUMMARY:-}" ]]; then
    printf 'Release `%s` failed at **%s**. See docs/deployment.md recovery.\n' "${GITHUB_SHA:-unknown}" "$stage" >> "$GITHUB_STEP_SUMMARY"
  fi
}
trap report_failure ERR
for name in GITHUB_SHA CLOUDFLARE_API_TOKEN CLOUDFLARE_ACCOUNT_ID VERCEL_TOKEN VERCEL_ORG_ID VERCEL_PROJECT_ID MEDICINES_WORKER_URL PRODUCTION_APP_URL; do
  if [[ -z "${!name:-}" ]]; then
    printf 'Missing release configuration: %s\n' "$name" >&2
    false
  fi
done
[[ "${RELEASE_SETUP_CONFIRMED:-}" == true ]]
[[ "$(git rev-parse HEAD)" == "$GITHUB_SHA" ]]
[[ "$MEDICINES_WORKER_URL" =~ ^https://[a-zA-Z0-9.-]+$ ]]
[[ "$PRODUCTION_APP_URL" =~ ^https://[a-zA-Z0-9.-]+$ ]]

deployment_file=$(mktemp)
trap 'rm -f "$deployment_file"' EXIT
run_stage() {
  stage=$1
  shift
  printf 'Release %s: %s\n' "$GITHUB_SHA" "$stage"
  "$@"
}

# Wrangler records applied migrations in D1. Reapplying skips them, including no-op releases.
run_stage migrations pnpm exec wrangler d1 migrations apply meddies --remote --config worker/wrangler.jsonc
run_stage worker pnpm exec wrangler deploy --config worker/wrangler.jsonc --tag "$GITHUB_SHA"
stage=app
printf 'Release %s: app\n' "$GITHUB_SHA"
pnpm exec vercel deploy --prod --yes --token "$VERCEL_TOKEN" \
  --meta "githubCommitSha=$GITHUB_SHA" --meta githubCommitRef=main > "$deployment_file"
deployment_url=$(tail -n 1 "$deployment_file")
[[ "$deployment_url" =~ ^https://[a-zA-Z0-9.-]+\.vercel\.app$ ]]

stage=smoke
printf 'Release %s: smoke\n' "$GITHUB_SHA"
# Generated URLs may require Vercel authentication. Verify the public alias points
# to the deployment just created, then probe that alias without a bypass secret.
pnpm exec vercel inspect "$PRODUCTION_APP_URL" --json --token "$VERCEL_TOKEN" > "$deployment_file"
node --input-type=module - "$deployment_file" "$deployment_url" <<'JS'
import { readFileSync } from 'node:fs'
const deployment = JSON.parse(readFileSync(process.argv[2], 'utf8'))
if (
  deployment.url !== new URL(process.argv[3]).hostname ||
  deployment.readyState !== 'READY' ||
  deployment.target !== 'production'
) {
  console.error('Production alias does not point to the ready deployment for this release.')
  process.exit(1)
}
JS
# Public GETs only. No identity, capability, medicine reads or writes.
app_status=$(curl --silent --show-error --fail --retry 5 --retry-all-errors --retry-delay 2 \
  --connect-timeout 10 --max-time 30 --output /dev/null --write-out '%{http_code}' "$PRODUCTION_APP_URL/")
[[ "$app_status" == 200 ]]
worker_status=$(curl --silent --show-error --retry 5 --retry-connrefused --retry-delay 2 \
  --connect-timeout 10 --max-time 30 --output /dev/null --write-out '%{http_code}' "${MEDICINES_WORKER_URL%/}/medicines")
[[ "$worker_status" == 401 ]]
printf 'Release %s succeeded: %s\n' "$GITHUB_SHA" "$deployment_url"
if [[ -n "${GITHUB_STEP_SUMMARY:-}" ]]; then
  printf 'Release `%s`: migrations, Worker, Vercel and public smoke passed. Deployment: %s\n' "$GITHUB_SHA" "$deployment_url" >> "$GITHUB_STEP_SUMMARY"
fi
