import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      'virtual:pwa-register': new URL('./tests/virtualPwaRegister.ts', import.meta.url).pathname,
    },
  },
  test: {
    include: ['tests/**/*.vitest.{ts,tsx}'],
    exclude: ['**/node_modules/**', '**/*.Rcheck/**'],
    testTimeout: 20_000,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.test.*'],
      reporter: ['text', 'json-summary'],
    },
  },
})
