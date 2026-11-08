import type {
  D1Database as WorkerD1Database,
  ExportedHandler as WorkerExportedHandler,
} from '@cloudflare/workers-types'

// The imported Worker runs under Node's Request/Response in these tests.
// Its own tsconfig checks the workerd handler against Cloudflare's globals.
declare global {
  type D1Database = WorkerD1Database
  type ExportedHandler<Env = unknown> = Omit<WorkerExportedHandler<Env>, 'fetch'> & {
    fetch?: (request: Request, env: Env) => Promise<Response>
  }
}
