/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

/**
 * Dedicated Vitest configuration.
 * Uses only the React plugin — omits @tailwindcss/vite and basicSsl.
 *
 * NOTE: Using pool:'vmThreads' with a single thread to minimize IPC overhead on Windows.
 * If vmThreads hangs, use 'forks' with singleFork:true.
 */
export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
    css: false,
    testTimeout: 15000,
    hookTimeout: 10000,
    // Use vmThreads for better Windows support in Node 24
    // vmThreads avoids subprocess spawning — runs in the same Node process via worker_threads + vm
    pool: 'vmThreads',
    poolOptions: {
      vmThreads: {
        singleThread: true
      }
    }
  }
});
