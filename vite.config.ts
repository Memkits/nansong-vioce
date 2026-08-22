import tailwindcss from '@tailwindcss/postcss';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
// The deployed artifact is a CDN-ready SPA. No server entry, Worker, model, or
// local runtime is needed after this Vite build completes.
export default defineConfig({
  base: './',
  css: { postcss: { plugins: [tailwindcss()] } },
  plugins: [react()],
  server: { host: '127.0.0.1' },
});
