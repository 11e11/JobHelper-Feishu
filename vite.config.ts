import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  build: {
    outDir: 'dist', emptyOutDir: true, sourcemap: true,
    rollupOptions: {
      input: { popup: resolve(__dirname, 'popup.html'), options: resolve(__dirname, 'options.html'), test: resolve(__dirname, 'test-page.html'), content: resolve(__dirname, 'src/content/index.ts') },
      output: { entryFileNames: chunk => chunk.name === 'content' ? 'content.js' : 'assets/[name]-[hash].js', chunkFileNames: 'assets/[name]-[hash].js', assetFileNames: 'assets/[name]-[hash][extname]' }
    }
  },
  test: { environment: 'jsdom', include: ['tests/**/*.test.ts'] }
});
