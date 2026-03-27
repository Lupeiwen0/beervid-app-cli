export function rethrowIfProcessExit(error: unknown): void {
  if (
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    error.name === 'ProcessExitError'
  ) {
    throw error
  }
}

export function getRawOptionValues(rawArgs: string[], optionName: `--${string}`): string[] {
  const values: string[] = []
  const prefix = `${optionName}=`

  for (let i = 0; i < rawArgs.length; i++) {
    const arg = rawArgs[i]

    if (arg === optionName) {
      const next = rawArgs[i + 1]
      if (typeof next === 'string' && !next.startsWith('-')) {
        values.push(next)
        i++
      }
      continue
    }

    if (arg.startsWith(prefix)) {
      values.push(arg.slice(prefix.length))
    }
  }

  return values
}

export function getRawOptionValue(
  rawArgs: string[],
  optionName: `--${string}`
): string | undefined {
  return getRawOptionValues(rawArgs, optionName).at(-1)
}
