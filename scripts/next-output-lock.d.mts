type Env = Record<string, string | undefined>
interface LockOptions {
  root: string
  owner: string
  env?: Env
  pid?: number
}
export declare const lockEnv: string
export function acquireNextOutputLock(
  options: LockOptions,
): Promise<{ env: Env; release: () => Promise<void> }>
export function withNextOutputLock<T>(
  options: LockOptions,
  action: (env: Env) => T | Promise<T>,
): Promise<T>
