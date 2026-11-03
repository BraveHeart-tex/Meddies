import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { verify } from './verify.mjs';
const secret = randomBytes(32).toString('hex');
const child = spawn('node_modules/.bin/wrangler', ['dev', '--port', '8542', '--var', `WORKER_SECRET:${secret}`], {
  stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, WRANGLER_SEND_METRICS: 'false' },
});
let logs = '';
child.stdout.on('data', x => { logs += x; });
child.stderr.on('data', x => { logs += x; });
try {
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    if (child.exitCode !== null) throw new Error('Worker exited before ready');
    try { await fetch('http://127.0.0.1:8542'); ready = true; break; } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  if (!ready) throw new Error('Worker startup timed out');
  await verify('http://127.0.0.1:8542', secret);
} catch (error) {
  console.error(logs.replaceAll(secret, '[redacted]'));
  throw error;
} finally { child.kill('SIGTERM'); }
