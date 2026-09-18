import { defineConfig } from 'vitest/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@income-verification': path.resolve(rootDir, 'src/income-verification'),
    },
  },
  test: {
    environment: 'node',
    include: [
      'src/income-verification/**/*.test.ts',
      'src/lib/**/*.test.ts',
      'api/**/*.test.ts',
    ],
    exclude: ['**/node_modules/**', '**/._*', '**/.*/**'],
  },
});
