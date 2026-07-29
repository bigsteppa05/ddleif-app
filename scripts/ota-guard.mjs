#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// OTA safety guard.
//
// Blocks an over-the-air (EAS Update) publish whenever the app's *native runtime
// fingerprint* has drifted from the last build. That is exactly the situation the
// two OTA traps live in:
//   • a new native dependency / SDK bump, or
//   • a change to native app config (app.json plugins, permissions, entitlements)
// In both cases an OTA update either can't reach installed builds (fingerprint
// runtimeVersion no longer matches) or, worse, ships JS that calls native code the
// installed binary doesn't have → crash on launch. When the fingerprint changed
// you must ship a new build + submit, not an OTA.
//
// The fingerprint intentionally ignores the generated android/ios directories, so
// it keys off the *sources* that determine native (dependencies, app config,
// config plugins) and stays identical across machines and CI.
//
// Usage:
//   node scripts/ota-guard.mjs           check current vs baseline (exit 1 if drifted/missing)
//   node scripts/ota-guard.mjs --save    record the current fingerprint as the baseline (run at build time)
//   node scripts/ota-guard.mjs --print   print the current fingerprint hash
// ─────────────────────────────────────────────────────────────────────────────
import { createFingerprintAsync } from '@expo/fingerprint';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASELINE = join(ROOT, '.ota-baseline.json');
const IGNORE = ['android/**', 'ios/**'];

const red = (s) => `\x1b[31m${s}\x1b[0m`;
const green = (s) => `\x1b[32m${s}\x1b[0m`;
const yellow = (s) => `\x1b[33m${s}\x1b[0m`;

async function currentHash() {
  const { hash } = await createFingerprintAsync(ROOT, { ignorePaths: IGNORE });
  return hash;
}

const mode = process.argv[2];

if (mode === '--print') {
  console.log(await currentHash());
  process.exit(0);
}

if (mode === '--save') {
  const hash = await currentHash();
  writeFileSync(BASELINE, `${JSON.stringify({ hash, savedAt: new Date().toISOString() }, null, 2)}\n`);
  console.log(green(`✓ Baseline saved: ${hash}`));
  console.log('  This is the native runtime your latest build ships. OTA updates are safe until it changes.');
  process.exit(0);
}

// Default: check.
const hash = await currentHash();

if (!existsSync(BASELINE)) {
  console.error(yellow('⚠ No OTA baseline found (.ota-baseline.json).'));
  console.error('  Make a native build first, then run `npm run baseline:save`, before publishing OTA updates.');
  console.error(`  Current fingerprint: ${hash}`);
  process.exit(1);
}

const base = JSON.parse(readFileSync(BASELINE, 'utf8'));
if (base.hash === hash) {
  console.log(`${green('✓ OTA-safe:')} native fingerprint matches the last build (${hash}).`);
  process.exit(0);
}

console.error(red('✗ OTA BLOCKED — the native runtime changed since your last build.'));
console.error(`  last build : ${base.hash}`);
console.error(`  current    : ${hash}`);
console.error('');
console.error('  You changed a native dependency or native app config (app.json plugins /');
console.error('  permissions / entitlements, a new expo package, an SDK bump, etc.).');
console.error('  An OTA update would NOT reach installed builds — and could crash them.');
console.error('');
console.error(`${red('  → Ship a new build instead:')} npm run build:production   (then submit),`);
console.error('    and once that build is live: npm run baseline:save');
process.exit(1);
