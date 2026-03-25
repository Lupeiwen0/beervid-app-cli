import { defineConfig } from 'tsup'
export default defineConfig({
  entry: ['src/cli.ts'],
  format: ['esm'],
  outDir: 'dist',
  outExtension: () => ({ js: '.mjs' }),
  shims: true,
  splitting: false,
  clean: true,
  banner: { js: '#!/usr/bin/env node' },
})
