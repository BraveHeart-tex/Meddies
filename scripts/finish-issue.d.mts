import type { ExecFileSyncOptionsWithStringEncoding } from 'node:child_process'

export function tickCriteria(body: string): { body: string; boxes: number }

export function finishIssue(
  argv: string[],
  execute?: (
    command: string,
    args: string[],
    options: ExecFileSyncOptionsWithStringEncoding,
  ) => string,
): { status: number; stdout: string; stderr: string }
