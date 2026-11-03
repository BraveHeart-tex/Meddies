import { and, eq, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import { movements, records, reminders, stock } from './schema';
interface Env { DB: D1Database; WORKER_SECRET: string }
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const started = performance.now();
    const reply = (body: unknown, status = 200) => Response.json(body, {
      status, headers: { 'cache-control': 'no-store', 'x-worker-ms': String(Math.round(performance.now() - started)) },
    });
    // Hash both inputs before comparing to avoid length/content-dependent secret comparison.
    if (!env.WORKER_SECRET) return reply({ error: 'unconfigured' }, 503);
    const digest = async (value: string) => new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
    const [actual, expected] = await Promise.all([
      digest(request.headers.get('authorization') ?? ''), digest(`Bearer ${env.WORKER_SECRET}`),
    ]);
    let difference = 0;
    for (let i = 0; i < expected.length; i++) difference |= actual[i] ^ expected[i];
    if (difference !== 0) return reply({ error: 'unauthorized' }, 401);
    if (request.method !== 'POST' || new URL(request.url).pathname !== '/') return reply({ error: 'not found' }, 404);
    // Bound request consumption even when Content-Length is absent or forged.
    const reader = request.body?.getReader();
    if (!reader) return reply({ error: 'invalid body' }, 400);
    let body = '';
    let size = 0;
    const decoder = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 2048) { await reader.cancel(); return reply({ error: 'too large' }, 413); }
      body += decoder.decode(value, { stream: true });
    }
    let input: Record<string, unknown>;
    try { input = JSON.parse(body); } catch { return reply({ error: 'invalid JSON' }, 400); }
    if (!input || typeof input !== 'object' || typeof input.run !== 'string' || !uuid.test(input.run)) return reply({ error: 'invalid run' }, 400);
    const run = input.run;
    const db = drizzle(env.DB);
    try {
      switch (input.op) {
        case 'fixture':
          await db.batch([
            db.insert(stock).values({ run, quantity: 20 }),
            db.insert(reminders).values({ run }),
          ]);
          return reply({ created: true });
        case 'state': {
          const [inventory, counts, reminder] = await db.batch([
            db.select().from(stock).where(eq(stock.run, run)),
            db.select({ records: sql<number>`(select count(*) from dose_record where run = ${run})`,
              movements: sql<number>`(select count(*) from stock_movement where run = ${run})` }).from(stock).where(eq(stock.run, run)),
            db.select({ token: reminders.token, completed: reminders.completed }).from(reminders).where(eq(reminders.run, run)),
          ]);
          if (!inventory[0]) return reply({ error: 'not found' }, 404);
          return reply({ stock: inventory[0].quantity, ...counts[0], reminder: reminder[0] });
        }
        case 'intake': {
          if (typeof input.action !== 'string' || !uuid.test(input.action) || !Number.isInteger(input.quantity) || Number(input.quantity) < 1 || Number(input.quantity) > 20 || (input.fail !== undefined && typeof input.fail !== 'boolean')) return reply({ error: 'invalid action' }, 400);
          const action = input.action;
          const quantity = Number(input.quantity);
          // The conditional update + unique action insert execute in one serialized D1 batch.
          // A duplicate action skips ALL effects. Failure in the last insert rolls back earlier writes.
          const results = await db.batch([
            db.update(stock).set({ quantity: sql`max(0, ${stock.quantity} - ${quantity})` })
              .where(and(eq(stock.run, run), sql`not exists (select 1 from dose_record where action = ${action})`)),
            db.insert(records).values({ action, run, quantity }).onConflictDoNothing({ target: records.action }),
            db.insert(movements).values({ action, run, quantity: input.fail ? -1 : quantity }).onConflictDoNothing({ target: movements.action }),
          ]);
          const original = await db.select().from(records).where(eq(records.action, action)).get();
          if (original?.run !== run || original.quantity !== quantity) return reply({ error: 'action mismatch' }, 409);
          return reply({ accepted: true, usage: {
            rowsRead: results.reduce((sum, result) => sum + result.meta.rows_read, 0),
            rowsWritten: results.reduce((sum, result) => sum + result.meta.rows_written, 0),
          } });
        }
        case 'claim':
        case 'complete': {
          if (typeof input.token !== 'string' || !uuid.test(input.token)) return reply({ error: 'invalid token' }, 400);
          // Evaluate expiry at statement execution on D1, not before a network round trip.
          const now = sql`(unixepoch('subsec') * 1000)`;
          if (input.op === 'claim') {
            const token = crypto.randomUUID();
            const claimed = await db.update(reminders).set({ token, leaseUntil: sql`${now} + 1500` })
              .where(and(eq(reminders.run, run), eq(reminders.completed, 0), sql`${reminders.leaseUntil} <= ${now}`)).returning({ run: reminders.run });
            return reply({ claimed: claimed.length === 1, token: claimed.length ? token : null });
          }
          const completed = await db.update(reminders).set({ completed: 1 })
            .where(and(eq(reminders.run, run), eq(reminders.token, input.token), eq(reminders.completed, 0), sql`${reminders.leaseUntil} > ${now}`)).returning({ run: reminders.run });
          return reply({ completed: completed.length === 1 });
        }
        default: return reply({ error: 'invalid operation' }, 400);
      }
    } catch {
      // Fixed event only. Never emit SQL params, credentials or user payloads.
      console.warn('d1_operation_failed');
      return reply({ error: 'database operation failed' }, 409);
    }
  },
};
