import path from 'path';
import { networkInterfaces } from 'node:os';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ command }) => ({
  root: 'client',
  base: './',
  plugins: [VitePWA({
    registerType: 'autoUpdate',
    injectRegister: false,
    includeAssets: ['app-icon-192.png', 'app-icon-512.png', 'apple-touch-icon.png'],
    manifest: {
      id: './#/app',
      name: '清洗机系列',
      short_name: '清洗机系列',
      description: '清洗机系列交互 Demo',
      start_url: './#/app',
      scope: './',
      display: 'standalone',
      background_color: '#edf3fa',
      theme_color: '#edf3fa',
      icons: [
        { src: 'app-icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: 'app-icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      ],
    },
    workbox: {
      globPatterns: ['**/*.{html,js,css,png,jpg,jpeg,webp,svg,webmanifest}'],
      navigateFallback: 'index.html',
      cleanupOutdatedCaches: true,
      clientsClaim: true,
    },
  })],
  esbuild: { jsx: 'automatic' },
  resolve: {
    alias: {
      '@client': path.resolve(__dirname, 'client'),
      '@shared': path.resolve(__dirname, 'shared'),
      '@': path.resolve(__dirname, 'client/src'),
    },
  },
  define: {
    'process.env.CLIENT_BASE_PATH': JSON.stringify(''), 'process.env': '{}',
    'import.meta.env.DEV_LAN_HOST': JSON.stringify(command === 'serve'
      ? Object.values(networkInterfaces()).flat().find(address => address?.family === 'IPv4' && !address.internal && /^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(address.address))?.address ?? ''
      : ''),
  },
  build: { outDir: '../dist', emptyOutDir: true },
  server: { port: 5173, host: '127.0.0.1', proxy: { '/api/notes': { target: 'http://127.0.0.1:8787', changeOrigin: false } } },
}));
