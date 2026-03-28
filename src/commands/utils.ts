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

export function parseStrictInteger(value: unknown, optionName: string): number | undefined {
  if (value === undefined) return undefined

  const normalized = String(value).trim()
  if (!/^-?\d+$/.test(normalized)) {
    console.error(`错误: ${optionName} 必须为整数`)
    process.exit(1)
  }

  const parsed = Number(normalized)
  if (!Number.isSafeInteger(parsed)) {
    console.error(`错误: ${optionName} 超出安全整数范围`)
    process.exit(1)
  }

  return parsed
}
