type Env = Record<string, string | undefined>

export function staleBuildReason(root: string): Promise<string | undefined>
export function isBrowserDevMode(env: Env): boolean
export function journeySetupError(options: { root: string; env: Env }): Promise<string | undefined>
