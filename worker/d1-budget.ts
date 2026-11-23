// Invocation-wide D1 accounting for the shared scheduler (#461). Workers Free allows 50 D1 calls
// per invocation; each binding execution counts once, raw or through Drizzle, and a batch counts as
// one call. The scheduler wraps its binding once per run and admits work only while its D1 calls,
// including any settlement it requires and the reserved Healthy run check, still fit.

export const D1_CALL_LIMIT = 50

/** Whether `calls` more D1 calls still fit this run's budget. */
export type Admits = (calls: number) => boolean

type D1Statement = ReturnType<D1Database['prepare']>

const EXECUTIONS = new Set(['first', 'run', 'all', 'raw'])

/** Wraps `db` so every statement execution, batch and exec counts as one D1 call. */
export function meterD1(db: D1Database): { db: D1Database; used: () => number } {
  let used = 0
  const originals = new WeakMap<object, D1Statement>()
  const meter = (statement: D1Statement): D1Statement => {
    const metered = new Proxy(statement, {
      get(target, property) {
        const value = Reflect.get(target, property, target)
        if (typeof value !== 'function') return value
        if (property === 'bind') return (...values: unknown[]) => meter(target.bind(...values))
        if (typeof property === 'string' && EXECUTIONS.has(property))
          return (...args: unknown[]) => {
            used++
            return value.apply(target, args)
          }
        return value.bind(target)
      },
    })
    originals.set(metered, statement)
    return metered
  }
  const metered = new Proxy(db, {
    get(target, property) {
      const value = Reflect.get(target, property, target)
      if (property === 'prepare') return (query: string) => meter(target.prepare(query))
      if (property === 'batch')
        return (statements: D1Statement[]) => {
          used++
          return target.batch(statements.map((statement) => originals.get(statement) ?? statement))
        }
      if (property === 'exec')
        return (query: string) => {
          used++
          return target.exec(query)
        }
      return typeof value === 'function' ? value.bind(target) : value
    },
  })
  return { db: metered, used: () => used }
}
