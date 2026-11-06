import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Relativer Pfad: läuft unter https://hjorven.github.io/flussreich2/ und lokal
  base: './',
  build: {
    chunkSizeWarningLimit: 800,
  },
  worker: {
    format: 'es',
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
