# Roxys Travel Plan

An installable, **offline-capable travel-map PWA** for the travel agency *Roxys
Travel Plan*. The agency curates points of interest (beaches, food, hikes,
attractions…) and shares **scoped subsets** with clients.

- **Client viewer** (the public site, on GitHub Pages): import the JSON travel
  file the agency emailed, then browse those places on a Leaflet map with
  numbered clusters, category/country filters, search, "open in Google Maps"
  links, a GPS "you are here" dot, and offline maps. Locks itself after the
  travel dates. It can also import a second **itinerary** file (a route exported
  from the agency's CRM) and draw the journey — numbered stops, route lines
  styled per transport mode, and annotation pins — over the same map.
- **Admin** (a **local desktop app** — "Roxys Admin", Windows + macOS): import
  POIs from CSV, auto-tag each point's country from its coordinates, manage
  categories (emoji + colour, applied globally), edit points on a table + map,
  and generate per-client travel files. The agency's master list is a **private
  file on the owner's computer** (kept in a Google Drive / OneDrive folder so it
  syncs between machines) and is **never published online**. See
  [docs/admin-desktop.md](docs/admin-desktop.md).

No backend. The public site is **client-only** and hostable on **GitHub Pages**;
the agency's points live solely in the desktop app's local file, and each
client's emailed subset lives on their device (in IndexedDB).

The default theme is dark with a gold accent (`#B8902F`); a light theme is in
Settings. UI is available in **English, French and German**.

---

## Tech stack

Vanilla JS + [Vite](https://vitejs.dev/) (multi-page), bundled to fully static
files. Key libraries (all keyless):

| Concern              | Library |
| -------------------- | ------- |
| Map                  | Leaflet + Leaflet.markercluster |
| Offline vector map   | protomaps-leaflet + @protomaps/basemaps + pmtiles (PMTiles) |
| Online tiles         | OpenStreetMap raster |
| Storage              | IndexedDB (via `idb`) |
| CSV import           | PapaParse |
| Country auto-tag     | `@turf/boolean-point-in-polygon` + Natural Earth borders |
| PWA / service worker | vite-plugin-pwa (Workbox) |

---

## Run locally

```bash
npm install
npm run dev      # → http://localhost:5173/RoxysPOI/  (admin: /RoxysPOI/admin.html)
npm run build    # → static site in dist/
npm run preview  # serve the production build locally
```

The app is served under the base path **`/RoxysPOI/`** (matches the GitHub Pages
project URL). Change it in one place — `base` in `vite.config.js` — if your repo
name differs.

> `npm run build` builds **only the client viewer** for the public site. The
> admin is built and shipped as a desktop app instead (below).

---

## Desktop admin app (Roxys Admin)

The admin runs as a local [Tauri](https://tauri.app/) desktop app so the agency's
master list never goes online. The master list is a JSON file the owner keeps in
a Google Drive / OneDrive folder, which carries it between their computers.

```bash
npm install
npm run tauri dev      # run the desktop admin locally (needs Rust + OS webview libs)
npm run tauri build    # build an installer for the current OS
npm run build:desktop  # just the admin front-end → dist-desktop/ (Tauri bundles this)
```

**Installers for end users** are built by `.github/workflows/release.yml`: push a
tag (e.g. `git tag v1.0.0 && git push --tags`) or run the workflow manually, and
GitHub Actions builds a macOS `.dmg` and a Windows `.exe`, attaching them to a
Release. The apps are **unsigned** (free) — see
[docs/admin-desktop.md](docs/admin-desktop.md) for install + first-run steps and
how the Drive-synced master file works.

Native file reads/writes are done by small Rust commands in
`src-tauri/src/main.rs`; the JS side lives in `src/data/desktopStore.js`, and
`config.isDesktop()` branches desktop vs. web behaviour.

---

## Deploy to GitHub Pages

A workflow is included at `.github/workflows/deploy.yml`. One-time setup:

1. Push to the `main` branch.
2. In the repo: **Settings → Pages → Source → "GitHub Actions"**.

Every push to `main` then builds with Vite and deploys `dist/` to Pages.

> If your repository is **not** named `RoxysPOI`, update `const BASE` in
> `vite.config.js` to `/<your-repo-name>/` so asset/manifest/service-worker URLs
> resolve correctly.

---

## Admin username & password

Default credentials: **user `roxy` / password `roxys-admin`**.

This is client-side only and the password hash ships in the bundle — it just
keeps casual visitors out, it is **not real security** (the master data is public
anyway; never put secrets in the repo).

Change the password by replacing the SHA-256 hash in `src/config.js`:

```bash
node -e "console.log(require('crypto').createHash('sha256').update('NEW_PASSWORD').digest('hex'))"
```

Paste the result into `ADMIN.passSha256` (and set `ADMIN.user`).

---

## CSV import format & column mapping

POIs come from the Google Maps app export, optionally run through
[exportgooglemaps.com](https://exportgooglemaps.com) to add coordinates.

**One CSV file = one category** (chosen on import). Defaults (case-insensitive,
whitespace-trimmed; adjust per file in the mapping UI):

| CSV column            | → field     |
| --------------------- | ----------- |
| `Title`               | `name`      |
| `Note`                | `note`      |
| `URL`                 | `googleUrl` |
| `Latitude`            | `lat`       |
| `Longitude`           | `lng`       |
| `Country` / `Address` | `country` (else derived from lat/lng) |
| `Tags`, `Comment`     | ignored     |

- Blank rows are skipped (the first data row of the agency's exports is often
  blank).
- **No coordinates?** The raw Google export (`Title, Note, URL, Tags, Comment`)
  has no lat/lng. Such rows import without a position and are flagged "missing
  coordinates" in the **Points** tab to fix manually — or run the file through
  exportgooglemaps.com first to add `Latitude`/`Longitude`, then re-import.
- **Country auto-tag:** points with coordinates but no country column are tagged
  by point-in-polygon against `public/data/ne_countries.json` (Natural Earth 50m
  admin-0, stripped) with a nearest-country fallback for coastal/island points.
  For higher precision you can regenerate that file from the 10m dataset
  (`nvkelso/natural-earth-vector`); keep one `name` property and round
  coordinates to ~4 decimals.

---

## Generating a client file

**Admin → Client file**: enter a client label, pick countries × categories, set
valid-from/until, then **Generate & download**. The JSON contains only that
subset plus the date range (no password). Email it to the client; they import it
on the welcome screen.

The master dataset (`data/master.json`) is edited via the admin and **exported**
(Admin → Master data → Export) to commit back to GitHub.

---

## Offline maps

Markers always work offline once a file is imported. Map **tiles** are online
OpenStreetMap by default; for offline tiles the agency generates per-country
PMTiles vector packs — see **[`public/data/packs/README.md`](public/data/packs/README.md)**.
The client downloads a pack in **Settings → Offline maps**; the map then switches
to the offline vector basemap automatically when offline and back to OSM when
online.

---

## Project structure

```
index.html / admin.html   client / admin entries
vite.config.js            base path, multi-page, PWA config
src/
  config.js               brand, admin creds, map + seed config
  map/                    Leaflet map, clusters, markers, online↔offline base layers, PMTiles source
  data/                   schema, IndexedDB, client-file import, master dataset
  csv/                    CSV import (PapaParse + column mapping)
  geo/                    country auto-tag + bbox helpers
  offline/                offline-pack download/cache/serve + Settings UI
  filters/                live category/country filtering
  admin/                  auth, category editor, POI table, client-file generator, CSV panel
  ui/                     i18n, theme, DOM/component helpers
  styles/                 design tokens + app + map CSS
public/
  assets/                 logos (logo-black.png / logo-white.png) + PWA icons
  i18n/                   en.json / fr.json / de.json (UI strings)
  data/                   master.json, ne_countries.json, packs/
```

## Editing translations

UI strings live in `public/i18n/{en,fr,de}.json` as flat `key → string` maps.
Edit the values (keep the keys); POI names/notes are never translated.

## Branding / logos

Replace `public/assets/logo-black.png` (for the light theme) and
`public/assets/logo-white.png` (for the dark theme). Regenerate the home-screen
icons (`pwa-192.png`, `pwa-512.png`, `maskable-512.png`, `apple-touch-icon.png`,
`favicon.png`) from your logo if you change it.
