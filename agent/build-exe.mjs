// =============================================================================
// Build the standalone helper: agent-dist/roxys-agent(.exe). It is a Node.js
// "single executable application": the helper is bundled into one CommonJS
// file and injected into a copy of the running node binary, so the person
// using it does not need Node.js installed. Windows builds of Roxys Admin ship
// it next to the app (see src-tauri/tauri.windows.conf.json).
//   npm run build:agent-exe
// =============================================================================

import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { inject } from 'postject';
import { SEA_ASSETS } from './assets.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const out = path.join(root, 'agent-dist');
const bundle = path.join(out, 'roxys-agent.cjs');
const blob = path.join(out, 'sea-prep.blob');
const exe = path.join(out, process.platform === 'win32' ? 'roxys-agent.exe' : 'roxys-agent');

fs.mkdirSync(out, { recursive: true });

// 1. One CommonJS file (SEA runs CommonJS and can only require built-in modules).
await build({
  entryPoints: [path.join(root, 'agent/cli.js')],
  outfile: bundle,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  legalComments: 'none',
  // import.meta.url is only used to find public/ when NOT running as the exe.
  logOverride: { 'empty-import-meta': 'silent' },
});
// Drop the "#!/usr/bin/env node" line: the SEA entry is not a shell script.
fs.writeFileSync(bundle, fs.readFileSync(bundle, 'utf8').replace(/^#![^\n]*\n/, ''));

// 2. The SEA blob, with the reference files embedded as assets.
const config = path.join(out, 'sea-config.json');
fs.writeFileSync(config, JSON.stringify({
  main: bundle,
  output: blob,
  disableExperimentalSEAWarning: true,
  useCodeCache: false,
  useSnapshot: false,
  assets: Object.fromEntries(Object.entries(SEA_ASSETS).map(([k, rel]) => [k, path.join(root, rel)])),
}, null, 2));
execFileSync(process.execPath, ['--experimental-sea-config', config], { stdio: 'inherit' });

// 3. Copy this node binary and inject the blob.
fs.rmSync(exe, { force: true });
fs.copyFileSync(process.execPath, exe);
fs.chmodSync(exe, 0o755);
if (process.platform === 'darwin') execFileSync('codesign', ['--remove-signature', exe]);
await inject(exe, 'NODE_SEA_BLOB', fs.readFileSync(blob), {
  sentinelFuse: 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2',
  machoSegmentName: process.platform === 'darwin' ? 'NODE_SEA' : undefined,
});
if (process.platform === 'darwin') execFileSync('codesign', ['--sign', '-', exe]);

// 4. Smoke test: the exe must start and answer.
const version = execFileSync(exe, ['--version'], { encoding: 'utf8' }).trim();
console.log(`Built ${path.relative(root, exe)} (roxys-agent ${version}, ${(fs.statSync(exe).size / 1e6).toFixed(0)} MB)`);
