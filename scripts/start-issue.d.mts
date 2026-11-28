import type { ExecFileSyncOptionsWithStringEncoding } from 'node:child_process'

export function startIssue(
  ref: string | undefined,
  execute?: (
    command: string,
    args: string[],
    options: ExecFileSyncOptionsWithStringEncoding,
  ) => string,
): { status: number; stdout: string; stderr: string }
