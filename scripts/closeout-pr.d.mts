import type { ExecFileSyncOptionsWithStringEncoding } from 'node:child_process'

export function marker(pr: number): string

export function readDeclaration(body: string | null): { number: number } | null

export function hasEvidence(body: string | null): boolean

export function closeoutPr(
  argv: string[],
  execute?: (
    command: string,
    args: string[],
    options: ExecFileSyncOptionsWithStringEncoding,
  ) => string,
): { status: number; stdout: string; stderr: string }
