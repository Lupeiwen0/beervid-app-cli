import type { CAC } from 'cac'
import cac from 'cac'
import { vi } from 'vitest'

export class ProcessExitError extends Error {
  code: number | undefined

  constructor(code: number | undefined) {
    super(`Process exited with code ${code}`)
    this.name = 'ProcessExitError'
    this.code = code
  }
}

function serializeConsoleArg(value: unknown): string {
  if (typeof value === 'string') return value
  if (value instanceof Error) return value.message
  if (value === undefined) return 'undefined'
  return JSON.stringify(value)
}

export async function runCommand(
  register: (cli: CAC) => void,
  args: string[]
): Promise<{
  exitCode: number | undefined
  logs: string[]
  errors: string[]
  warns: string[]
}> {
  const cli = cac('beervid')
  register(cli)

  const logs: string[] = []
  const errors: string[] = []
  const warns: string[] = []

  const logSpy = vi.spyOn(console, 'log').mockImplementation((...message) => {
    logs.push(message.map(serializeConsoleArg).join(' '))
  })
  const errorSpy = vi.spyOn(console, 'error').mockImplementation((...message) => {
    errors.push(message.map(serializeConsoleArg).join(' '))
  })
  const warnSpy = vi.spyOn(console, 'warn').mockImplementation((...message) => {
    warns.push(message.map(serializeConsoleArg).join(' '))
  })
  const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
    throw new ProcessExitError(code)
  }) as typeof process.exit)

  cli.parse(['node', 'beervid', ...args], { run: false })

  let exitCode: number | undefined
  try {
    await cli.runMatchedCommand()
  } catch (error) {
    if (error instanceof ProcessExitError) {
      exitCode = error.code
    } else {
      throw error
    }
  } finally {
    logSpy.mockRestore()
    errorSpy.mockRestore()
    warnSpy.mockRestore()
    exitSpy.mockRestore()
  }

  return { exitCode, logs, errors, warns }
}
