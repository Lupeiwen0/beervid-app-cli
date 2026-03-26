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
