import { defineConfig } from 'vite';

// Tauri invokes Cargo from src-tauri/target. On Windows, Rust build artifacts
// (especially DLLs) may be locked while Cargo is compiling. Vite must never
// attempt to watch those generated files, or Node may fail with EBUSY.
export default defineConfig({
  clearScreen: false,
  server: {
    host: '127.0.0.1',
    port: 1420,
    strictPort: true,
    watch: {
      ignored: [
        '**/src-tauri/target/**',
        '**/src-tauri/gen/**',
        '**/node_modules/**',
        '**/dist/**',
      ],
    },
  },
  envPrefix: ['VITE_', 'TAURI_ENV_*'],
  build: {
    target: process.env.TAURI_ENV_PLATFORM === 'windows' ? 'chrome105' : 'safari13',
  },
});
