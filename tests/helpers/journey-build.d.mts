type Env = Record<string, string | undefined>

export declare const buildInputs: string[]
export function newestBuildInput(
  root: string,
): Promise<{ path: string; mtimeMs: number } | undefined>
export function staleBuildReason(root: string): Promise<string | undefined>
export function isBrowserDevMode(env: Env): boolean
export function journeySetupError(options: { root: string; env: Env }): Promise<string | undefined>
