import tailwindcss from '@tailwindcss/postcss';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
// The application is a CDN-ready SPA. The build script adds a tiny static asset
// delivery adapter for Sites; analysis, synthesis, and model execution remain
// entirely in the browser.
export default defineConfig({
  base: './',
  css: { postcss: { plugins: [tailwindcss()] } },
  plugins: [react()],
  server: { host: '127.0.0.1' },
});
