import path from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    setupFiles: ['tests/setup.ts'],
    clearMocks: true,
    restoreMocks: true,
    coverage: {
      provider: 'v8',
      include: ['src/lib/**/*.{ts,tsx}', 'src/store/**/*.{ts,tsx}'],
      exclude: [
        'src/vite-env.d.ts',
        'src/main.tsx',
        'src/**/__mocks__/**',
        // Integration-heavy adapters are validated in end-to-end/runtime flows, not frontend unit tests.
        'src/lib/agent/**',
        'src/lib/llm.ts',
        'src/lib/command_executor.ts',
        'tests/**',
      ],
      reporter: ['text', 'json-summary', 'lcov'],
      reportsDirectory: 'coverage',
      thresholds: {
        lines: 70,
        functions: 70,
        statements: 70,
        branches: 70,
      },
    },
  },
});
