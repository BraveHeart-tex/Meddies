import { createHash, timingSafeEqual } from 'node:crypto';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function POST(request: Request) {
  const reply = (body: unknown, status: number) => Response.json(body, { status, headers: { 'cache-control': 'no-store' } });
  const { PROBE_SECRET, WORKER_SECRET, WORKER_URL } = process.env;
  if (!PROBE_SECRET || !WORKER_SECRET || !WORKER_URL) return reply({ error: 'unconfigured' }, 503);
  const hash = (value: string) => createHash('sha256').update(value).digest();
  if (!timingSafeEqual(hash(request.headers.get('authorization') ?? ''), hash(`Bearer ${PROBE_SECRET}`))) return reply({ error: 'unauthorized' }, 401);
  const reader = request.body?.getReader();
  if (!reader) return reply({ error: 'invalid body' }, 400);
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 2048) { await reader.cancel(); return reply({ error: 'too large' }, 413); }
    chunks.push(value);
  }
  try {
    const started = performance.now();
    const response = await fetch(WORKER_URL, {
      method: 'POST', headers: { authorization: `Bearer ${WORKER_SECRET}`, 'content-type': 'application/json' },
      body: Buffer.concat(chunks), cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(8000),
    });
    const body = await response.text();
    return new Response(body, { status: response.status, headers: {
      'content-type': 'application/json', 'cache-control': 'no-store',
      'x-worker-ms': response.headers.get('x-worker-ms') ?? '',
      'x-upstream-ms': String(Math.round(performance.now() - started)),
      'x-vercel-region-observed': process.env.VERCEL_REGION ?? 'local',
      'x-node-version': process.version,
    } });
  } catch {
    console.warn('worker_request_failed');
    return reply({ error: 'upstream unavailable' }, 502);
  }
}
