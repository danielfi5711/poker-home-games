import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { VitePWA } from 'vite-plugin-pwa';
import type { Plugin } from 'vite';

// Every build gets its own id. It's baked into the client (__BUILD_ID__) and
// written to /version.json, which is never precached — so an installed app
// running an old build sees the server has a newer one and makes the player
// restart (client/src/UpdateGate.tsx).
const BUILD_ID = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

function versionFile(): Plugin {
  return {
    name: 'poker-version-file',
    apply: 'build',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ build: BUILD_ID }) });
    },
  };
}

export default defineConfig(({ command }) => ({
  root: 'client',
  define: {
    // 'dev' under `vite` (no version.json there), so the dev server never shows the gate.
    __BUILD_ID__: JSON.stringify(command === 'build' ? BUILD_ID : 'dev'),
  },
  plugins: [
    preact(),
    versionFile(),
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
        theme_color: '#0b1a33',
        background_color: '#0b1a33',
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
}));
