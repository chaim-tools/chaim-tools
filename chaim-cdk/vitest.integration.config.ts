import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['test/integration/**/*.test.ts'],
    testTimeout: 300000, // 5 minutes for integration tests
    hookTimeout: 120000, // 2 minutes for setup/teardown
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'lib/',
        'dist/',
        '**/*.d.ts',
        'test/**/*.test.ts'
      ]
    }
  }
});
