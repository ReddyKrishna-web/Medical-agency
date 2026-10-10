import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  server: { port: 5173 },
  preview: { port: 4173 },
  build: {
    sourcemap: false,
    // The only chunk above the default 500 kB is `geo`, a single static
    // dataset (country-state-city ships its city DB in one file and cannot be
    // split further). 143 kB gzipped, cached long-term, so the limit is
    // calibrated just above it while still guarding every other chunk.
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        /**
         * Split the few heavy dependencies into their own cached chunks so no
         * single chunk crosses Vite's 500 kB warning threshold. These vendor
         * chunks change rarely, so browsers keep using them across deploys.
         */
        manualChunks(id: string) {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('country-state-city') || id.includes('countries-and-timezones')) {
            return 'geo';
          }
          if (id.includes('recharts') || id.includes('d3-') || id.includes('victory-vendor')) {
            return 'charts';
          }
          if (id.includes('react-dom') || id.includes('react-router') || id.includes('@tanstack')) {
            return 'framework';
          }
          return undefined;
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    css: true,
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    coverage: { reporter: ['text', 'html'] },
  },
});
