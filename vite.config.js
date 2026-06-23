import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import { renameSync, existsSync } from 'node:fs';
import { VitePWA } from 'vite-plugin-pwa';

// Two build targets share one codebase:
//   • web (default)  → the public CLIENT viewer, served from GitHub Pages at
//     https://<user>.github.io/RoxysPOI/  (base '/RoxysPOI/', PWA on). The admin
//     is NOT published here — the agency's list stays off the public web.
//   • desktop (`--mode desktop`) → the ADMIN, bundled into the Tauri desktop app
//     (relative base, no service worker, output dist-desktop/).
const BASE = '/RoxysPOI/';

// Desktop bundles a single admin entry; Tauri serves the frontend root, so emit
// it as index.html (the source page is admin.html).
function emitAdminAsIndex(outDir) {
  return {
    name: 'rename-admin-to-index',
    apply: 'build',
    closeBundle() {
      const from = resolve(__dirname, outDir, 'admin.html');
      const to = resolve(__dirname, outDir, 'index.html');
      if (existsSync(from)) renameSync(from, to);
    },
  };
}

export default defineConfig(({ mode }) => {
  const isDesktop = mode === 'desktop';
  const outDir = isDesktop ? 'dist-desktop' : 'dist';

  return {
    base: isDesktop ? './' : BASE,
    build: {
      target: 'es2020',
      outDir,
      rollupOptions: {
        // Web: client entry only. Desktop: admin entry only.
        input: isDesktop ? { admin: resolve(__dirname, 'admin.html') } : { main: resolve(__dirname, 'index.html') },
      },
    },
    plugins: isDesktop
      ? [emitAdminAsIndex(outDir)]
      : [
          VitePWA({
            registerType: 'autoUpdate',
            includeAssets: ['assets/favicon.png', 'assets/logo-black.png', 'assets/logo-white.png'],
            manifest: {
              name: 'Roxys Travel Plan',
              short_name: 'Roxys',
              description: 'Your expert for unique adventure — curated travel points of interest, offline.',
              lang: 'en',
              start_url: '.',
              scope: '.',
              display: 'standalone',
              orientation: 'portrait',
              background_color: '#101010',
              theme_color: '#B8902F',
              icons: [
                { src: 'assets/pwa-192.png', sizes: '192x192', type: 'image/png' },
                { src: 'assets/pwa-512.png', sizes: '512x512', type: 'image/png' },
                { src: 'assets/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
              ],
            },
            workbox: {
              // Precache the client shell. The admin and the agency master.json are
              // no longer part of the public build, so they are never cached here.
              globPatterns: ['**/*.{html,js,css,png,svg,json,ico,woff2}'],
              globIgnores: ['**/data/packs/**', '**/data/ne_countries.json'],
              maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
              navigateFallback: null,
              runtimeCaching: [
                {
                  // OpenFreeMap vector basemap — PASSIVE cache of what was viewed.
                  urlPattern: ({ url }) => url.hostname === 'tiles.openfreemap.org',
                  handler: 'CacheFirst',
                  options: {
                    cacheName: 'openfreemap',
                    expiration: { maxEntries: 1500, maxAgeSeconds: 7 * 24 * 60 * 60 },
                    cacheableResponse: { statuses: [0, 200] },
                  },
                },
                {
                  // OSM raster — only the internal admin map uses it. Passive.
                  urlPattern: ({ url }) => /(^|\.)tile\.openstreetmap\.org$/.test(url.hostname),
                  handler: 'CacheFirst',
                  options: {
                    cacheName: 'osm-raster-tiles',
                    expiration: { maxEntries: 400, maxAgeSeconds: 7 * 24 * 60 * 60 },
                    cacheableResponse: { statuses: [0, 200] },
                  },
                },
              ],
            },
            devOptions: { enabled: false },
          }),
        ],
  };
});
