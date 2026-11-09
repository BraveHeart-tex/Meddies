export function canOpenPort(): Promise<boolean>
export function productionBuild(options: {
  root?: string
  env?: Record<string, string | undefined>
  run: (command: string, args: string[]) => void | Promise<void>
}): Promise<string>
