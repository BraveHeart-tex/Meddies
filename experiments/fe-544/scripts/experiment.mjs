import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { encrypt, decrypt } from './backup.mjs';

// Explicitly limited to synthetic FE-544 resources. No application or scheduler is deployed.
process.umask(0o077);
const local = process.argv.includes('--local');
const mode = local ? '--local' : '--remote';
const bucket = process.env.FE544_BUCKET;
if (bucket && !/^meddies-fe-544-[a-z0-9-]+$/.test(bucket)) throw new Error('Use an isolated FE-544 bucket');
const started = performance.now();
mkdirSync('.private', { recursive: true, mode: 0o700 });
chmodSync('.private', 0o700);
const workspace = mkdtempSync(resolve('.private/run-'));
const recovery = mkdtempSync(join(tmpdir(), 'meddies-fe-544-recovery-'));
/** @type {{stage:string, ms:number, pass:boolean}[]} */
const stages = [];
/** @param {string} stage @param {string[]} args @param {RegExp|null} expectedRejection */
function wrangler(stage, args, expectedRejection = null) {
  const before = performance.now();
  try {
    const result = execFileSync(resolve('node_modules/.bin/wrangler'), args, {
      encoding: 'utf8', timeout: 180_000, maxBuffer: 16 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, WRANGLER_SEND_METRICS: 'false', WRANGLER_WRITE_LOGS: 'false', WRANGLER_LOG_SANITIZE: 'true' },
    });
    if (expectedRejection) throw new Error('Invalid write unexpectedly succeeded');
    stages.push({ stage, ms: Math.round(performance.now() - before), pass: true });
    return result;
  } catch (error) {
    if (expectedRejection && error && typeof error === 'object' && 'stderr' in error && 'stdout' in error
      && expectedRejection.test(String(error.stderr) + String(error.stdout))) {
      stages.push({ stage: `${stage}-rejected-as-expected`, ms: Math.round(performance.now() - before), pass: true });
      return '';
    }
    stages.push({ stage, ms: Math.round(performance.now() - before), pass: false });
    // Wrangler errors can contain SQL. Do not print child output or exception objects.
    throw new Error(`Stage failed: ${stage}`);
  }
}

/** @param {string} db @param {string} sql @returns {Record<string,unknown>[][]} */
function query(db, sql) {
  const output = wrangler(`query-${db}`, ['d1', 'execute', db, mode, '--command', sql, '--json']);
  /** @type {{success:boolean, results:Record<string,unknown>[]}[]} */
  const result = JSON.parse(output);
  assert.ok(result.length > 0 && result.every(item => item.success));
  return result.map(item => item.results);
}

/** @param {string} db */
function snapshot(db) {
  const schema = query(db, "SELECT type,name,tbl_name,sql FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY type,name;")[0];
  const tables = schema.filter(row => row.type === 'table').map(row => String(row.name));
  assert.equal(tables.length, 11, 'Expected complete representative schema');
  /** @type {Record<string, Record<string,unknown>[]>} */
  const records = {};
  for (const table of tables) {
    assert.match(table, /^[a-z_]+$/);
    records[table] = query(db, `SELECT * FROM "${table}" ORDER BY 1;`)[0];
  }
  assert.deepEqual(query(db, 'PRAGMA foreign_key_check;')[0], []);
  assert.deepEqual(query(db, 'PRAGMA quick_check;')[0], [{ quick_check: 'ok' }]);
  return { schema, records };
}

/** @param {Buffer} bytes */
function digest(bytes) { return createHash('sha256').update(bytes).digest('hex'); }
/** @param {string} file @param {Buffer|string} data */
function privateFile(file, data) { writeFileSync(file, data, { mode: 0o600, flag: 'wx' }); }

try {
  const existing = query('SOURCE', "SELECT name FROM sqlite_schema WHERE name='account';")[0];
  if (existing.length === 0) wrangler('seed-source', ['d1', 'execute', 'SOURCE', mode, '--file', 'fixture.sql', '--yes']);
  const targetTables = query('RESTORE', "SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE '_cf_%' AND name NOT LIKE 'sqlite_%';")[0];
  assert.equal(targetTables.length, 0, 'Restore target must be empty; create a fresh isolated target for a rerun');
  const before = snapshot('SOURCE');
  assert.equal(before.records.account.length, 2);
  assert.equal(before.records.dose_record.length, 3);
  const exportFile = join(workspace, 'export.sql');
  const exportStarted = performance.now();
  wrangler('export', ['d1', 'export', 'SOURCE', mode, '--output', exportFile]);
  chmodSync(exportFile, 0o600);
  const sql = readFileSync(exportFile);
  const key = randomBytes(32);
  const onlineKey = join(workspace, 'online.key');
  const recoveredKey = join(recovery, 'recovery.key');
  privateFile(onlineKey, key);
  privateFile(recoveredKey, key);
  const encrypted = encrypt(sql, key);
  const encryptedFile = join(workspace, 'backup.enc');
  privateFile(encryptedFile, encrypted);
  const object = bucket ? `${bucket}/${new Date().toISOString().replaceAll(':', '-')}.enc` : null;
  if (object) wrangler('upload-ciphertext', ['r2', 'object', 'put', object, '--remote', '--file', encryptedFile, '--content-type', 'application/octet-stream']);
  const backupMs = Math.round(performance.now() - exportStarted);
  const manifest = { format: 'MEDDIES-BACKUP-1', object, sha256: digest(encrypted), sqlSha256: digest(sql), keyId: digest(key) };
  privateFile(join(recovery, 'manifest.json'), JSON.stringify(manifest, null, 2));
  // Simulate loss of export/active key. Recovery reads only separately held key + stored ciphertext.
  key.fill(0);
  sql.fill(0);
  unlinkSync(onlineKey);
  unlinkSync(exportFile);
  if (object) unlinkSync(encryptedFile);
  assert.equal(existsSync(onlineKey), false);
  const restoreStarted = performance.now();
  const downloaded = join(recovery, 'downloaded.enc');
  if (object) wrangler('download-ciphertext', ['r2', 'object', 'get', object, '--remote', '--file', downloaded]);
  else privateFile(downloaded, readFileSync(encryptedFile));
  chmodSync(downloaded, 0o600);
  const stored = readFileSync(downloaded);
  assert.equal(digest(stored), manifest.sha256);
  const restoredSQL = decrypt(stored, readFileSync(recoveredKey));
  assert.equal(digest(restoredSQL), manifest.sqlSha256);
  const importFile = join(recovery, 'restore.sql');
  privateFile(importFile, restoredSQL);
  restoredSQL.fill(0);
  wrangler('restore-isolated', ['d1', 'execute', 'RESTORE', mode, '--file', importFile, '--yes']);
  unlinkSync(importFile);
  const after = snapshot('RESTORE');
  // Generic assertion messages avoid exposing records in diagnostics on failure.
  assert.ok(JSON.stringify(after) === JSON.stringify(before), 'Restored schema or records differ');
  const constraintCases = [
    { name: 'foreign-key', sql: "INSERT INTO medication VALUES('bad-fk','absent','synthetic',0);", error: /FOREIGN KEY constraint failed/i },
    { name: 'check', sql: "INSERT INTO medication VALUES('bad-check','a1','synthetic',-1);", error: /CHECK constraint failed/i },
    { name: 'unique', sql: "INSERT INTO account VALUES('bad-unique','synthetic-active');", error: /UNIQUE constraint failed/i },
    { name: 'not-null', sql: "INSERT INTO account VALUES('bad-null',NULL);", error: /NOT NULL constraint failed/i },
  ];
  for (const probe of constraintCases) {
    for (const db of ['SOURCE', 'RESTORE']) {
      wrangler(`${probe.name}-${db}`, ['d1', 'execute', db, mode, '--command', probe.sql, '--json'], probe.error);
    }
  }
  // Recompare after negative probes: no bad rows may survive.
  assert.ok(JSON.stringify(snapshot('RESTORE')) === JSON.stringify(before), 'Constraint probes changed restored records');
  const report = {
    outcome: 'PASS', timestamp: new Date().toISOString(), node: process.version,
    platform: `${process.platform}/${process.arch}`, wrangler: '4.157.0', mode,
    destination: object ?? 'private-local-filesystem', ciphertextBytes: encrypted.length,
    sha256: manifest.sha256, tables: 11, records: Object.values(after.records).reduce((n, rows) => n + rows.length, 0),
    schemaAndRecordsEqual: true, integrityChecks: 'PASS', constraints: constraintCases.map(probe => probe.name),
    activeKeyRemoved: true, recoveredKeyOutsideRepository: true,
    recoveryCustody: 'separate-directory-simulation-on-same-host',
    schedulerConnected: false, deletedAccountHazardPresent: after.records.account.some(row => row.id === 'a2'),
    backupMs, restoreAndVerifyMs: Math.round(performance.now() - restoreStarted), totalMs: Math.round(performance.now() - started),
    stages,
  };
  // A private locator is useful to the operator; never includes key contents.
  privateFile(join(workspace, 'recovery-location.txt'), recovery);
  for (const file of [recoveredKey, downloaded, join(recovery, 'manifest.json')]) assert.equal(statSync(file).mode & 0o777, 0o600);
  console.log(JSON.stringify(report, null, 2));
} catch {
  console.error(JSON.stringify({ outcome: 'FAIL', stages, diagnostic: 'Check the last stage. Child diagnostics and disk logs are suppressed to protect SQL and credentials.' }, null, 2));
  process.exitCode = 1;
}
