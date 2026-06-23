import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import { VitePWA } from 'vite-plugin-pwa';

// GitHub Pages project site is served from https://<user>.github.io/RoxysPOI/
// `base` is the single source of truth for the path prefix — manifest, service
// worker and every runtime fetch derive from it (see import.meta.env.BASE_URL).
const BASE = '/RoxysPOI/';

export default defineConfig({
  base: BASE,
  build: {
    target: 'es2020',
    rollupOptions: {
      // Multi-page app: a client entry (index.html) and an admin entry (admin.html).
      // Separate pages keep admin code out of the client bundle and avoid SPA
      // routing fallbacks that GitHub Pages cannot provide.
      input: {
        main: resolve(__dirname, 'index.html'),
        admin: resolve(__dirname, 'admin.html'),
      },
    },
  },
  plugins: [
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
        // Precache the app shell. Both HTML entries + hashed JS/CSS are added
        // automatically; we add the runtime static data the app fetches so it
        // works offline on first run. NOTE: never precache *.pmtiles (too big —
        // those live in IndexedDB, downloaded on demand).
        globPatterns: ['**/*.{html,js,css,png,svg,json,ico,woff2}'],
        // Don't precache offline packs (too big — live in IndexedDB) nor the
        // country-borders file (admin-only, used online during CSV import).
        globIgnores: ['**/data/packs/**', '**/data/ne_countries.json'],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        navigateFallback: null,
        runtimeCaching: [
          {
            // OpenStreetMap raster tiles — PASSIVE cache of tiles the user has
            // actually viewed (within OSM tile usage policy). We never bulk
            // prefetch raster tiles; offline coverage uses PMTiles vector packs.
            urlPattern: ({ url }) =>
              /(^|\.)tile\.openstreetmap\.org$/.test(url.hostname) && url.pathname.endsWith('.png'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'osm-raster-tiles',
              expiration: { maxEntries: 800, maxAgeSeconds: 7 * 24 * 60 * 60 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      devOptions: {
        // Keep the SW off during `vite dev` to avoid stale-cache confusion while
        // developing; it is fully active in the production build / preview.
        enabled: false,
      },
    }),
  ],
});
