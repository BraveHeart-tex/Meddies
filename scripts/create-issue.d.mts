export function createIssue(
  args: string[],
  execute?: (...args: string[]) => string,
): { status: number; stdout: string; stderr: string }
