import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: [
        'src/index.ts',
        'src/jev/types.ts',
        'src/jev/vercel-ai-gateway.ts',
        'src/jev/typesafe-native.ts',
      ],
      thresholds: {
        lines: 75,
        functions: 75,
        branches: 60,
        statements: 75,
      },
    },
  },
});
