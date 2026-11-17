import { defineConfig } from 'vite';

export default defineConfig({
  publicDir: 'engine/public',
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
  build: { target: 'esnext', outDir: 'dist' },
});
