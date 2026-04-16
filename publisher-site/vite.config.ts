import { defineConfig } from 'vite';

export default defineConfig({
  server: { port: 3002, host: 'localhost' },
  preview: { port: 3002, host: '0.0.0.0' },
});
