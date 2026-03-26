import { defineConfig } from 'tsup'
import pkg from './package.json' with { type: 'json' }

export default defineConfig({
  entry: ['src/cli.ts'],
  format: ['esm'],
  outDir: 'dist',
  outExtension: () => ({ js: '.mjs' }),
  shims: true,
  splitting: false,
  clean: true,
  banner: { js: '#!/usr/bin/env node' },
  define: {
    __PKG_VERSION__: JSON.stringify(pkg.version),
  },
})
