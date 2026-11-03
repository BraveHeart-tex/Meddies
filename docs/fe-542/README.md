# FE-542 - Atomic D1 operations

2026-11-03. All five spike acceptance criteria PASS. Synthetic data only. This proves the narrow persistence path, not production readiness or notification delivery. No downstream ticket started.

## Result

Keep D1 + Drizzle. The measured path is Next.js Node on Vercel -> authenticated HTTPS Worker -> Drizzle D1 binding -> isolated D1 database. Vercel has no D1 binding and holds no Cloudflare account/API token. No measured blocker justifies Neon. No architecture decision changed.

| Acceptance criterion                                      | Evidence                                                                                                                                                                                                                                                                                                                         |
| --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Vercel reaches D1 through a measured concrete integration | Production `/api/probe` forwards fixed operations to the Worker; complete HTTP verification passes, observed function region fra1 and Node v22.23.4.                                                                                                                                                                             |
| Migration and atomic intake/stock rollback                | Wrangler applied `0001_spike.sql` remotely: seven statements, reported 0.94 ms SQL duration. Drizzle batch changes stock, inserts intake, then intentionally violates the movement CHECK. All three changes roll back: stock 20, no intake, no movement.                                                                         |
| Retry, concurrent claimants and lease recovery            | Two identical concurrent intake actions plus a later retry leave stock 18, one intake, one movement. Reusing action with quantity 3 returns 409, preserving state. Two claimants yield exactly one winner. Expired lease can be reclaimed, old owner cannot complete, current owner can, completed work cannot be claimed again. |
| Latency, quotas, credentials and ORM support              | Measurements and limits below; direct Worker and Vercel path both pass.                                                                                                                                                                                                                                                          |
| Focused reproducible evidence and blockers                | Scripts, deployment outputs, raw synthetic verification, environment and limitations in this directory. No unresolved blocker for this narrow outcome.                                                                                                                                                                           |

## Environment

- Starting commit `ffbb1bc`, current branch `main`, isolated source `experiments/fe-542`. Functional source commit recorded in final review section.
- Vercel: `meddies-fe-542-spike`, existing `bravehearttexs-projects` Hobby scope established by FE-540. CLI 65.10.0; Node 22.x engine, actual runtime v22.23.4; fra1, maxDuration 10 seconds. Immutable deployment: https://meddies-fe-542-spike-55nerpiy8-bravehearttexs-projects.vercel.app. Alias: https://meddies-fe-542-spike.vercel.app.
- Worker: https://meddies-fe-542-spike.karacabora26.workers.dev. Version `b2183ac6-f828-486e-bb63-ad8c6a81b7f6`; compatibility date 2026-03-17, startup 3 ms, upload 177.91 KiB / gzip 34.93 KiB. No cron configured.
- D1: `meddies-fe-542-spike`, ID `52dfb6da-383e-4df8-9933-d7e5e7f3dd01`, created in EEUR. Four tiny synthetic tables plus migration metadata, no production schema or real identity/medication data. Read replication not enabled by this experiment.
- Next.js 16.4.4, React 19.2.0, Drizzle 0.45.4, Wrangler 4.157.0, Workers types 5.20261103.1; exact transitive versions in package-lock.json. Local Node 22.22.0. Initial Drizzle 0.45.1/Wrangler 4.76.0 were patched before final verification; install audit now reports zero vulnerabilities.
- Saved Wrangler OAuth had expired: refresh returned HTTP 400. User ran `wrangler login`; authenticated create/migration/deploy then passed. Global Vercel executable is broken, so use pinned `npm exec --package=vercel@65.10.0`. Automatic Git integration created by `vercel link` was immediately disconnected. No DNS change, paid purchase or subscription change.

## Measurements

First measured run, 18 authenticated calls per path (including intended database-failure and payload-conflict responses). These are small-sample observed order statistics, not a capacity or SLA claim. The unauthenticated 401 call is excluded. Local caller was this development machine; no claim about physical network location.

| Path / wall-time measure                             | Min    | Median | Nearest-rank p95 / max |
| ---------------------------------------------------- | ------ | ------ | ---------------------- |
| Caller -> Worker -> D1 -> caller                     | 123 ms | 167 ms | 401 ms                 |
| Worker handler wall time, direct path                | 30 ms  | 48 ms  | 122 ms                 |
| Caller -> Vercel -> Worker -> D1 -> caller           | 148 ms | 219 ms | 924 ms                 |
| Vercel outbound Worker fetch including response body | 41 ms  | 100 ms | 272 ms                 |
| Worker handler wall time, Vercel path                | 19 ms  | 47 ms  | 160 ms                 |

Headers are measured in each runtime; worker wall time includes D1 waits and is **not CPU time**. Samples include startup/network variation and different synthetic runs. The Vercel proxy adds a measurable network boundary; this sample does not isolate its causal overhead. Warm versus cold behavior, sustained throughput, quota exhaustion and CPU headroom were not established. The only concurrency claims are the tested two-writer/two-claimant races.

Retry batch metadata reports two rows read and zero rows written (excluding the following record lookup). Indexed run/action filters avoid full-table scans for these fixtures. Raw outputs retain per-request status, elapsed milliseconds, Worker wall time, Vercel upstream time, runtime and region. Failures are not hidden by aggregate latency.

## Atomicity, Drizzle and leases

`drizzle-orm/d1` runs inside the Worker with `env.DB`. Its `db.batch` successfully executes typed query builders and returns D1 metadata. Wrangler applies versioned SQL migrations; this spike does not validate Drizzle Kit schema generation. Drizzle Kit's `d1-http` configuration is migration/tooling support, not evidence that the Worker binding driver works in Node.

A batch first subtracts stock only if the action does not exist, then inserts the uniquely keyed dose record and stock movement with targeted action conflict handling. No JavaScript read-then-write decision occurs between batch statements. A failed final CHECK aborts the complete batch. This is a storage failure injection, not a simulated outage. Reusing a committed action for different run/quantity performs no writes and returns conflict after checking the immutable record. Keys are global synthetic UUIDs in this experiment. Full user-scoped action revisions, outcome corrections and offline conflict resolution remain later work.

The installed Drizzle D1 `transaction()` implementation emits `BEGIN`/`COMMIT`; it is not used or assumed compatible here. The demonstrated atomic primitive is D1/Drizzle batch, supported by [Cloudflare's batch contract](https://developers.cloudflare.com/d1/worker-api/d1-database/#batch) and [Drizzle's D1 batch release](https://orm.drizzle.team/docs/latest-releases/drizzle-orm-v0290). Arbitrary interactive transactions are not proven.

Claims use one conditional `UPDATE ... RETURNING`, not select-then-update. D1 computes current time inside the statement. Each successful acquisition generates a fresh unpredictable token and a 1.5-second lease; completion requires both matching token and an unexpired lease. The synthetic test deliberately abandons the winner, waits 1.8 seconds, reclaims and attempts completion with the old token before completing with the new token. Timing is deliberately short for this experiment; production lease duration/renewal requires workload measurements. This establishes database ownership/fencing only. A database transaction cannot atomically cover FCM/Web Push submission; no exactly-once external delivery claim is made.

## Credentials and limits

- `WORKER_SECRET`: random 256-bit capability restricted by the Worker to five fixed synthetic operations: fixture/state/intake/claim/complete. It grants access only to this experiment's database through this Worker, not arbitrary SQL or Cloudflare management. The failure-injection switch is intentionally test-only. Do not point it at production data.
- `PROBE_SECRET`: separate random 256-bit credential for the Vercel probe. Vercel holds only this and the Worker capability/URL in sensitive Production environment variables; none is NEXT_PUBLIC. Worker secret stored through `wrangler secret put`. Local copies are in ignored `.env.probe` mode 0600. Never paste values into issues, command arguments or git.
- Deployment OAuth scope is broader: Wrangler reports account/user read, D1/Workers write and other product scopes. It stays on the maintainer machine and is not shipped to either runtime. It is not a least-privilege CI token. Future CI should use a separate resource-scoped token.
- Both endpoints reject incorrect credentials with 401/no-store. Responses are no-store; request bodies are capped at 2048 bytes even without Content-Length. SQL uses bound parameters. Logs use fixed failure labels only. Probe has no browser access, real-user session/ownership checks or general SQL endpoint; its shared capability is acceptable only for isolated synthetic evidence.
- [D1 Free pricing](https://developers.cloudflare.com/d1/platform/pricing/): 5 million rows read/day, 100,000 written/day, 5 GB account storage and 10 databases. [D1 limits](https://developers.cloudflare.com/d1/platform/limits/): 500 MB per Free database, 50 queries per Worker invocation, 100 bound parameters per statement, 30-second SQL duration. A batch counts as one query for the invocation limit. Index writes count toward row writes; daily overages fail until reset rather than becoming unlimited free capacity.
- [Workers Free limits](https://developers.cloudflare.com/workers/platform/limits/): 100,000 requests/day, 10 ms CPU/request, 128 MB memory. CPU is distinct from wall time. [Workers Paid](https://developers.cloudflare.com/workers/platform/pricing/) starts at $5/month plus usage. Free quotas are account-shared. No subscription was purchased; account billing plan and remaining shared balance were not independently inspected, so this is Free-allowance sizing, not an invoice guarantee.
- Vercel Hobby eligibility and payload limits were established in FE-540. This tiny personal experiment fits that usage shape; it does not prove future app costs or CPU capacity. Keep monitoring actual usage before expansion. No evidence warrants introducing another database/provider.

## Reproduce

Existing authenticated Cloudflare/Vercel accounts are required for remote reproduction. Commands below target only this isolated experiment. Preserve secrets privately.

```sh
cd experiments/fe-542
npm ci
npm run typecheck
npm run migrate:local
npm test
npm run build

# For a new isolated account/database, create it and replace database_id in wrangler.jsonc:
# npm exec -- wrangler d1 create meddies-fe-542-spike
npm exec -- wrangler d1 migrations apply DB --remote
npm exec -- wrangler deploy
# Enter an independently generated secret interactively, never as a literal shell argument:
npm exec -- wrangler secret put WORKER_SECRET

npm exec --yes --package=vercel@65.10.0 -- vercel link --yes --project meddies-fe-542-spike --scope bravehearttexs-projects
npm exec --yes --package=vercel@65.10.0 -- vercel git disconnect --yes
# Configure sensitive Production PROBE_SECRET, WORKER_SECRET and WORKER_URL through private UI
# or interactive `vercel env add NAME production --sensitive`, then redeploy:
npm exec --yes --package=vercel@65.10.0 -- vercel deploy --yes --prod --scope bravehearttexs-projects

# Private ignored .env.probe contains PROBE_URL and PROBE_SECRET, plus WORKER_URL/WORKER_SECRET
node --env-file=.env.probe scripts/verify.mjs
# Direct Worker check uses same suite with Worker URL and capability:
node --env-file=.env.probe --input-type=module - <<'JS'
import { verify } from './scripts/verify.mjs';
await verify(process.env.WORKER_URL, process.env.WORKER_SECRET);
JS
```

Each run creates a fresh synthetic UUID namespace. Reruns need no destructive reset. Evidence includes [Worker deployment](worker-deploy.txt), [Vercel deployment](vercel-deploy.txt), [cloud build](build.txt), [D1 metadata](d1-info.txt), [direct Worker test](worker-verification.txt) and [complete Vercel path test](vercel-verification.txt). The initial local stub failed 501 versus expected 401, establishing the red tracer; local migration and real implementation then passed. Final local/full-suite outputs and independent review are recorded below.

Cleanup after evidence acceptance: remove only Vercel project `meddies-fe-542-spike`, Worker `meddies-fe-542-spike` and D1 database `meddies-fe-542-spike`; remove ignored `.env.probe` and local build/runtime state. This permanently deletes synthetic fixtures and invalidates capabilities. Do not delete shared credentials, accounts or FE-540/541 projects. Cleanup has not run so reviewers can reproduce.

## Final verification and review

Tested functional source is commit `ecda6de` (reviewed against starting commit `ffbb1bc`). The Worker/Vercel deployment identifiers above contain that functional source. Final evidence-only additions do not require redeployment.

Final strict typecheck, production build and full FE-542 suite pass. Final remote repeats also pass: [Vercel path](vercel-verification-final.txt), [direct Worker](worker-verification-final.txt), [local suite](local-verification.txt), [local build](local-build.txt). Cloud build completed in 23 seconds. D1 metadata snapshot: 65.5 kB, EEUR, replication disabled; 24-hour analytics are delayed snapshots and are not a total for these tests.

Final authenticated sample, 18 calls each: Vercel round-trip min/median/p95/max 125/166/370/370 ms, upstream fetch 49/69/189/189 ms, Worker wall time 18/27/95/95 ms. Direct Worker round-trip 114/169/307/307 ms, Worker wall time 29/37/101/101 ms. Original samples above remain available; final results are a repeat, not a replacement or an isolated overhead comparison. Concurrent intake batch metadata: winner reads 1/writes 7 (including indexes), duplicate reads 2/writes 0; subsequent retry reads 2/writes 0. Metadata excludes the following lookup query. All behavior assertions pass.

### Standards

Independent read-only review of `ffbb1bc...ecda6de`: 0 documented-standard violations, 0 actionable judgement smells. No functional changes requested.

### Spec

Independent read-only review against FE-542: 0 missing/partial requirements, 0 scope-creep findings, 0 implemented-but-wrong findings within this feasibility scope. Reviewers inspected source and saved evidence; they did not rerun remote tests.

Review summary: Standards 0 findings; Spec 0 findings. No unresolved narrow-scope blocker. FE-542 is ready for user review, not daily-use readiness.
