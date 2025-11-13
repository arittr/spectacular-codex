import { defineConfig } from 'tsup';

const isDev = process.env.npm_lifecycle_event === 'dev';

export default defineConfig({
  clean: true,
  entry: ['./src/index.ts'],
  format: ['esm'],
  minify: !isDev,
  ...(isDev && { onSuccess: 'node dist/index.js' }),
  target: 'esnext',
});
