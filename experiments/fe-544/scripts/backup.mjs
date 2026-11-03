import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const header = Buffer.from('MEDDIES-BACKUP-1\n');

/** @param {Buffer} sql @param {Buffer} key @returns {Buffer} */
export function encrypt(sql, key) {
  const nonce = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, nonce);
  cipher.setAAD(header);
  const ciphertext = Buffer.concat([cipher.update(sql), cipher.final()]);
  return Buffer.concat([header, nonce, cipher.getAuthTag(), ciphertext]);
}

/** @param {Buffer} backup @param {Buffer} key @returns {Buffer} */
export function decrypt(backup, key) {
  if (backup.length < header.length + 28 || !backup.subarray(0, header.length).equals(header)) {
    throw new Error('Invalid backup format');
  }
  const offset = header.length;
  const decipher = createDecipheriv('aes-256-gcm', key, backup.subarray(offset, offset + 12));
  decipher.setAAD(header);
  decipher.setAuthTag(backup.subarray(offset + 12, offset + 28));
  // Nothing is returned or written until authentication succeeds in final().
  return Buffer.concat([decipher.update(backup.subarray(offset + 28)), decipher.final()]);
}
