import path from 'path';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

export default defineConfig(({ command }) => {
  const rawPort = process.env.PORT;
  if (command === 'serve' && !rawPort) {
    throw new Error('PORT environment variable is required while serving the app.');
  }

  const port = Number(rawPort ?? '4173');
  if (Number.isNaN(port) || port <= 0) {
    throw new Error(`Invalid PORT value: "${rawPort}"`);
  }

  return {
    base: process.env.BASE_PATH ?? '/',
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: { '@': path.resolve(import.meta.dirname, 'src') },
      dedupe: ['react', 'react-dom'],
    },
    root: path.resolve(import.meta.dirname),
    build: {
      outDir: path.resolve(import.meta.dirname, 'dist/public'),
      emptyOutDir: true,
    },
    server: {
      port,
      strictPort: true,
      host: '0.0.0.0',
      allowedHosts: true,
      fs: { strict: true },
    },
    preview: {
      port,
      host: '0.0.0.0',
      allowedHosts: true,
    },
  };
});
