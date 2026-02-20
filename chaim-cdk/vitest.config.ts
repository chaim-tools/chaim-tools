import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    fileParallelism: false,
    include: ['test/unit/**/*.test.ts', 'src/**/*.test.ts'],
    exclude: ['test/integration/**/*.test.ts', '**/node_modules/**'],
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
