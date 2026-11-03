# FE-544 - Encrypted backup restoration

2026-11-03. Synthetic-data feasibility experiment only. No daily automation or downstream ticket implemented. Next.js remains on Vercel; no app deployment or architecture decision changed.

## Findings

The measured path is remote D1 SQL export -> local AES-256-GCM encryption -> private R2 Standard object -> downloaded ciphertext -> separately held recovery key -> a fresh remote D1 database. Time Travel is not involved. The 11-table, 23-record fixture round-trips with exact schema, index and record equality, UTF-8, nulls, half-tablet quantity, paused schedules, unscheduled intake and reminder states. This is a representative experimental schema, not the future production schema.

| Acceptance criterion | Finding and evidence |
| --- | --- |
| Export, encrypt, store separately | PASS. Dedicated remote D1 source; only ciphertext uploaded to `meddies-fe-544-backups`. [Remote report](remote-verification.json). |
| Independent key recovery and isolated restore | PASS at the technical boundary. Active key/export removed before recovery from a separate directory outside the repository. Downloaded bytes, decrypted SQL hashes, all records and schema match. FK/CHECK/UNIQUE/NOT NULL negative probes reject writes in both databases; integrity checks pass. Actual offline/off-device key custody remains an operational requirement. |
| Destination, permissions, cost, 24-hour feasibility | Documented below. Private R2 settings verified in [bucket evidence](bucket-access.txt). Small-fixture timings establish headroom, not an operational SLA. |
| Deletion preservation and retention integration | Required integration mapped below. Restored snapshots remain quarantined. No deletion ledger, scheduler reactivation or retention job is implemented. |
| Focused reproducible evidence and blockers | Scripts and sanitized reports included. Initial R2 error 10042 was resolved when Bora enabled R2. No remaining blocker to this narrow D1/R2 round trip. Operational limitations below still gate daily reliance. |

## Environment and resources

- macOS darwin/arm64; Node v22.22.0; Wrangler 4.157.0; exact npm dependencies in `experiments/fe-544/package-lock.json`.
- Source: `meddies-fe-544-source`, ID `9a8ae8b6-1cff-4fed-8a2c-7015744238a5`, EEUR.
- Initial target: `meddies-fe-544-restore`, ID `7c1be07c-4f4f-4dfd-bc8b-30eeae36a08d`, EEUR.
- Final target: `meddies-fe-544-restore-final`, ID `28e4afa6-50a9-4a7b-b7f6-5dc0dd08df17`, EEUR. No deployed Worker, scheduler, push provider or application points at either target.
- Bucket: `meddies-fe-544-backups`, location EEUR, Standard. `r2.dev` public access disabled; no custom domains. No encryption keys, SQL, medication labels, push credentials or signed export URLs are attached as evidence.

R2 is independent of the D1 database and survives database loss, but shares the Cloudflare account/provider. This does not prove recovery after account suspension or a provider-wide outage. If that failure domain must be covered, replicate ciphertext plus its manifest to a private second-provider store and repeat the restore there. No such destination is proven here.

## Cryptography and key custody

`scripts/backup.mjs` uses Node's AES-256-GCM with a random 32-byte key and fresh 12-byte nonce per encryption. The versioned binary envelope is `MEDDIES-BACKUP-1\n`, nonce, 16-byte authentication tag, ciphertext. The header is authenticated as additional data; decryption returns no bytes before authentication succeeds. Wrong-key, damaged-header/nonce/ciphertext and truncated-file cases fail. This small experiment format is not an independently audited production backup tool.

The runner sets umask 0077, uses exclusive 0600 files and 0700 directories, and never sends keys to R2/D1/Vercel. It copies the key and manifest to a new OS temporary recovery directory outside the repository, then removes the active key and plaintext export before downloading/decrypting. A private `.private/run-*/recovery-location.txt` locates the recovery kit. The manifest records object name, ciphertext/SQL digests and key fingerprint; it contains no key. The key is 32 raw random bytes, not a password or a value to paste into an issue.

This demonstrates recovery independent of primary-database contents and app environment variables. The runbook's decryption command also passed in a fresh process with no inherited Cloudflare/app credentials or primary database access; see [offline recovery evidence](offline-recovery.json). Both key copies were made on one maintainer host. It does **not** demonstrate survival of losing that host or an actual offline-media/vault recovery. Temporary directories can be purged. Before real use, place the key, manifest, format/tool version and recovery instructions in an encrypted off-device vault or offline medium, with independently recoverable access credentials; verify recovery on a clean host. Keep all historical key versions needed for retained backups. Do not store the sole key or vault recovery secret in the app account, D1 or backup bucket. This custody drill is a daily-use prerequisite.

Successful runs remove plaintext exports and restored SQL. Failed runs can leave 0600 plaintext inside private experiment directories; inspect/clean them privately. File unlinking is not secure erasure on SSDs. Use an encrypted temporary volume for future real data. The runner captures child output, prints only stage names/timing/pass status, suppresses Wrangler disk logs and enables its sanitization. Initial development runs used Wrangler's normal private logs with synthetic data; never use them as production diagnostics.

## Permissions and costs

This manual experiment uses the maintainer's existing Wrangler OAuth credentials, which can create/query D1 resources and manage R2. They are broader than an unattended backup identity and remain on the host. No token is embedded in source, arguments or evidence. Recovery requires separate access to R2 and to a restore destination; decrypting downloaded ciphertext itself works offline.

Before automation, provision separate export, backup-object and restore/admin identities; verify their actual denied operations. Use bucket-specific Object Read & Write / Object Read only credentials over R2's S3 API for data access. Those object permissions do not work with Wrangler's Cloudflare REST API path. Bucket administration and retention configuration need a separate administrative identity. Do not describe this Wrangler run as a least-privilege credential test. See [R2 authentication](https://developers.cloudflare.com/r2/api/tokens/).

[R2 pricing](https://developers.cloudflare.com/r2/pricing/), checked 2026-11-03: Standard includes 10 GB-month storage, 1 million Class A and 10 million Class B operations monthly, with free egress. Beyond allowance: $0.015/GB-month, $4.50/million Class A, $0.36/million Class B; billing rounds units upward. For sizing, thirty 10 MB daily snapshots retain about 300 MB, with roughly thirty writes plus checks and occasional restore reads monthly. That fits the listed allowance if shared account usage leaves room. This 4.7 KB fixture is much smaller. Actual invoices/shared remaining allowance were not inspected; this is not a zero-cost guarantee. No paid plan was purchased by the agent. Do not use Infrequent Access for this design without separate pricing analysis.

## Recovery runbook and reproduction

From `experiments/fe-544`:

```sh
npm ci
npm run typecheck
npm test

# Local D1 round trip. Requires an empty local RESTORE database.
npm run experiment -- --local

# Existing Cloudflare authentication and enabled R2 required.
# For a new account create a source, EMPTY target and private bucket, then edit wrangler.jsonc IDs:
# npx wrangler d1 create meddies-fe-544-source --location eeur
# npx wrangler d1 create meddies-fe-544-restore-new --location eeur
# npx wrangler r2 bucket create meddies-fe-544-backups --location eeur --storage-class Standard
FE544_BUCKET=meddies-fe-544-backups npm run experiment
```

The runner seeds only an empty source and refuses a populated target. A rerun needs a new isolated target name/ID in `wrangler.jsonc`; it does not reset or overwrite an existing restored database. Local reruns require a fresh local state directory or removal of only this experiment's disposable `.wrangler/state` after inspection. Remote reproduction creates extra D1 databases and consumes account quota; keep the working set small. [D1 import/export documentation](https://developers.cloudflare.com/d1/best-practices/import-export-data/) describes the SQL export/import route and its limitations. This fixture has no virtual tables, triggers, generated columns or production-scale writes; compatibility must be rechecked as the schema grows.

For a disaster recovery without the primary database:

1. Keep all reminder processing and app writes stopped. Retrieve the independent key/manifest/tool version using the recovery kit, not app configuration. Obtain recovery credentials independently.
2. Download the manifest's exact R2 object with authenticated `wrangler r2 object get BUCKET/OBJECT --remote --file downloaded.enc` into a new 0700 recovery directory under umask 0077. Disable Wrangler disk logs (`WRANGLER_WRITE_LOGS=false`); never expose presigned URLs or SQL in shared diagnostics.
3. Compare ciphertext SHA-256 with the independently held manifest. Decrypt using the recovered key; wrong key/tag/format must stop recovery. The following command uses only the key, ciphertext and tool, without source D1 or app secrets:

```sh
# Run inside the private recovery directory; set FE544_TOOL to the absolute path
# of this checked-out experiments/fe-544 directory before running this command.
node --input-type=module - <<'JS'
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
const { decrypt } = await import(process.env.FE544_TOOL + '/scripts/backup.mjs');
const manifest = JSON.parse(readFileSync('manifest.json', 'utf8'));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const encrypted = readFileSync('downloaded.enc');
assert.equal(hash(encrypted), manifest.sha256);
const sql = decrypt(encrypted, readFileSync('recovery.key'));
assert.equal(hash(sql), manifest.sqlSha256);
writeFileSync('restore.sql', sql, { mode: 0o600, flag: 'wx' });
JS
```

4. Import `restore.sql` with `wrangler d1 execute EMPTY_ISOLATED_TARGET --remote --file restore.sql --yes`. Never import directly into an active production binding. Compare schema/indexes, counts and critical records to the snapshot manifest/checks; run foreign-key/integrity and invalid-write probes. The experiment performs full source/target comparison, which will not be available if the source is lost; production manifests need sufficient expected counts/schema/version checks.
5. Apply the latest deletion ledger and cancellation/expiry state, invalidate sessions/device registrations and stale caches, and reconcile current reminder eligibility before reconnecting any app/scheduler. Verify no deleted identity or stale reminder can run. These production gates are future work, not a demonstrated switch-over here.
6. Remove temporary plaintext/key working copies after verification; retain the independently held recovery kit for the encrypted retention period. Authorize cutover only after the gates pass.

## 24-hour targets and later integration

The first remote run measured 4.5 seconds export/encrypt/upload and 32.8 seconds download/decrypt/import/full comparison/probes. Final timings are in [the final report](remote-verification-final.json). Database provisioning, operator availability, provider/account outages, real dataset size and production cutover are not included. There is ample small-fixture headroom for a 24-hour recovery target, but end-to-end service recovery and sustained recovery-point compliance remain unproven.

- **FE-595 daily backups:** bounded execution outside Vercel request handlers; authenticated export; encrypted upload; durable manifest/key-version association; verify object readability/decryption; monitor last *successful* recoverable snapshot age. Scheduling exactly every 24 hours leaves no allowance for export duration/failures. Use a shorter interval with retries (for example twice daily), an age threshold with response margin, and independent actionable alerts before 24 hours. Do not mark success on upload alone. No automation is added here.
- **FE-596 30-day expiry:** delete ciphertext, manifests, replicas and abandoned multipart uploads; handle key rotation without orphaning retained snapshots. R2 lifecycle can be a backstop, but [Cloudflare documents deletion lag](https://developers.cloudflare.com/r2/buckets/object-lifecycles/), typically within 24 hours of expiration. A nominal 30-day rule alone does not establish a hard maximum of 30 days. Implement explicit age-based deletion, margin and verification/alerts across every copy; test failure cases. No lifecycle retention rule was enabled in this spike.
- **FE-594/597 account deletion and safe restore:** keep minimal durable deletion tombstones independently of the restored snapshot, retained long enough to cover every restorable backup. Gate all access/sends until the latest tombstones are fetched and verified; fail closed if unavailable. Reapply account/history deletions with correct dependent-row ordering, remove device/session credentials, prevent re-allowlisting/recreated identity resurrection, and reconcile pending/claimed/stale reminders. Tombstone retention/identity semantics need those tickets' decisions. The fixture deliberately retains `a2` and its pending reminder: an old snapshot cannot know about a subsequent deletion. This is a demonstrated hazard, not deleted-account suppression proof. No live reminder system is connected to the restored snapshots.
- **Stale clients and service restoration:** invalidate recovered sessions and client cache generations; prevent offline queues from resurrecting deleted records; recheck cancellation, expiry and ownership before any send. Test current production schema and a clean-host restore, then measure complete authorized cutover. No stale-cache handling is implemented here.

## Cleanup and review

Keep the synthetic resources during review. After acceptance, delete only the R2 objects listed in the reports, then the empty `meddies-fe-544-backups` bucket, and the three D1 databases named above. Use `wrangler r2 object delete`, `wrangler r2 bucket delete` and `wrangler d1 delete` after confirming exact names. Remove this experiment's `.private`, `.wrangler` state and the OS recovery directories located by `recovery-location.txt`. This permanently removes only spike artifacts. Preserve shared accounts/credentials and FE-540/541/542 resources. Cleanup has not run.

Tested source is commit `45b9ba0`, reviewed against `bc514b4`. Final evidence-only additions do not change the tested implementation. The initial TDD tracer failed `Not implemented`, then passed after encryption/decryption was added. Unit verification covers recovered-key round trip and damaged/wrong-key rejection. Local and remote integration reports cover the actual adapter/storage path. Initial local/remote reports predate final diagnostic handling; use [final local](local-verification-final.json) and [final remote](remote-verification-final.json) reports for final behavior. Expected constraint rejections are explicitly classified as passing checks in final reports.

All three experiment packages pass strict typechecking: [FE-541](typecheck-fe541.txt), [FE-542](typecheck-fe542.txt), [FE-544](typecheck-fe544.txt). The full available test suites pass: [authentication](test-fe541.txt), [atomic D1/leases](test-fe542.txt), [backup encryption](test-fe544.txt). FE-544 is a Node script experiment with no separate application build.

### Standards

Independent read-only review of `bc514b4...45b9ba0`: 0 actionable findings. No documented-standard violations; no baseline smells warrant changes in this narrow spike.

### Spec

Independent read-only review of the same diff against FE-544: 0 actionable defects, 0 scope-creep findings. Same-host key custody, production deletion/retention gates and end-to-end recovery remain disclosed limitations. Reviewers inspected source and saved evidence; no remote reruns performed.

Review summary: Standards 0 findings; Spec 0 findings. FE-544 is ready for user review of the narrow feasibility outcome. No claim of production readiness or approval to start FE-595/596/597 is made.
