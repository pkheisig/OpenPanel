import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/**/*.vitest.ts'],
    exclude: ['**/node_modules/**', '**/*.Rcheck/**'],
    testTimeout: 20_000,
  },
})
