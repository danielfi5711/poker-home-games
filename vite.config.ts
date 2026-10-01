import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  root: 'client',
  plugins: [
    preact(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/apple-touch-icon.png'],
      // injectManifest (not the default generateSW) because the service
      // worker needs its own push/notificationclick handlers for host
      // buy-in-request notifications (src/sw.ts) — generateSW only
      // supports the built-in caching strategies, no custom event handlers.
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,png,svg,ico}'],
      },
      manifest: {
        name: 'Poker Home Games',
        short_name: 'Poker Night',
        description: 'Track buy-ins and cash-outs for local poker games — host-approved buy-ins, automatic settlement, all-time leaderboard.',
        theme_color: '#155c3e',
        background_color: '#155c3e',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        scope: '/',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
  server: {
    port: 5173,
    proxy: {
      '/healthz': 'http://localhost:8080',
      '/api': 'http://localhost:8080',
    },
  },
  build: {
    outDir: '../dist/public',
    emptyOutDir: true,
  },
});
