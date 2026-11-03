import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { encrypt, decrypt } from '../scripts/backup.mjs';

test('restore SQL using the independently recovered key', () => {
  const onlineKey = randomBytes(32);
  const recoveryKey = Buffer.from(onlineKey);
  const sql = Buffer.from("CREATE TABLE fixture(id TEXT PRIMARY KEY);\nINSERT INTO fixture VALUES('synthetic');\n");
  const backup = encrypt(sql, onlineKey);
  onlineKey.fill(0);
  assert.deepEqual(decrypt(backup, recoveryKey), sql);
});

test('wrong keys and corrupted or truncated backups cannot yield restored SQL', () => {
  const key = randomBytes(32);
  const backup = encrypt(Buffer.from('synthetic SQL'), key);
  assert.throws(() => decrypt(backup, randomBytes(32)));
  for (const offset of [0, 16, 28, backup.length - 1]) {
    const corrupt = Buffer.from(backup);
    corrupt[offset] ^= 1;
    assert.throws(() => decrypt(corrupt, key));
  }
  for (const length of [0, 10, backup.length - 1]) {
    assert.throws(() => decrypt(backup.subarray(0, length), key));
  }
});

test('repeated backups do not reuse a nonce or expose the SQL', () => {
  const key = randomBytes(32);
  const sql = Buffer.from('INSERT INTO secret VALUES (\'SYNTHETIC-PRIVATE-MARKER\');');
  const first = encrypt(sql, key);
  assert.notDeepEqual(first, encrypt(sql, key));
  assert.equal(first.includes(Buffer.from('SYNTHETIC-PRIVATE-MARKER')), false);
});
