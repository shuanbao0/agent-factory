#!/usr/bin/env node
/**
 * migrate-sync-gateway.mjs — Smart sync for openclaw.json and models.json during update
 *
 * Handles intelligent merging of gateway config files that `agent-factory update`
 * preserves but doesn't merge (missing new fields from incoming version).
 *
 * Merge rules:
 *   config/openclaw.json:
 *     - agents.defaults:  deep merge (add new defaults from incoming)
 *     - agents.list:      never touch (user's agent registry)
 *     - tools, commands:  add new fields from incoming (code-defined settings)
 *     - gateway:          add new fields only, keep user values (port, auth)
 *     - plugins.entries:  add new entries, keep existing
 *     - models, channels, meta, wizard: keep user values, add new fields only
 *
 *   config/models.json:
 *     - providers:  add new providers, keep existing (user-configured)
 *     - default:    keep user value
 *
 * Usage:
 *   node scripts/migrate-sync-gateway.mjs              # sync gateway configs
 *   node scripts/migrate-sync-gateway.mjs --dry-run     # preview changes
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const OPENCLAW_JSON = join(ROOT, 'config', 'openclaw.json');
const OPENCLAW_DEFAULT = join(ROOT, 'config', 'openclaw.default.json');
const MODELS_JSON = join(ROOT, 'config', 'models.json');
const MODELS_DEFAULT = join(ROOT, 'config', 'models.default.json');
const UPDATE_DIR = process.env.AF_UPDATE_DIR || null;

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');

// ── Helpers ──

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf-8'));
  } catch {
    return null;
  }
}

/**
 * Deep merge: add new keys at all levels, keep existing values
 */
function deepAddNew(existing, incoming, prefix) {
  if (existing === null || existing === undefined) return { result: incoming, changes: [`${prefix}: created`] };
  if (incoming === null || incoming === undefined) return { result: existing, changes: [] };

  if (typeof existing !== 'object' || typeof incoming !== 'object' ||
      Array.isArray(existing) || Array.isArray(incoming)) {
    return { result: existing, changes: [] };
  }

  const result = { ...existing };
  const changes = [];

  for (const key of Object.keys(incoming)) {
    if (!(key in result)) {
      result[key] = incoming[key];
      changes.push(`${prefix}.${key}: added`);
    } else if (typeof result[key] === 'object' && typeof incoming[key] === 'object' &&
               !Array.isArray(result[key]) && result[key] !== null && incoming[key] !== null) {
      const sub = deepAddNew(result[key], incoming[key], `${prefix}.${key}`);
      result[key] = sub.result;
      changes.push(...sub.changes);
    }
  }

  return { result, changes };
}

// ── Get incoming config ──

function getIncomingOpenclaw() {
  if (UPDATE_DIR) {
    // Prefer full openclaw.json from new version, fallback to default
    const p = join(UPDATE_DIR, 'config', 'openclaw.json');
    const data = readJson(p);
    if (data) return data;
    const pd = join(UPDATE_DIR, 'config', 'openclaw.default.json');
    return readJson(pd);
  }
  // Standalone: use local default as reference
  return readJson(OPENCLAW_DEFAULT);
}

function getIncomingModels() {
  if (UPDATE_DIR) {
    const p = join(UPDATE_DIR, 'config', 'models.json');
    const data = readJson(p);
    if (data) return data;
    const pd = join(UPDATE_DIR, 'config', 'models.default.json');
    return readJson(pd);
  }
  return readJson(MODELS_DEFAULT);
}

// ── Main ──

console.log(`${dryRun ? '[DRY-RUN] ' : ''}=== Sync gateway configs ===\n`);
if (UPDATE_DIR) {
  console.log(`  Using incoming files from: ${UPDATE_DIR}\n`);
}

let totalUpdated = 0;
let totalUnchanged = 0;

// ── 1. Sync openclaw.json ──

const existingOC = readJson(OPENCLAW_JSON);
const incomingOC = getIncomingOpenclaw();

if (existingOC && incomingOC) {
  const allChanges = [];
  const result = { ...existingOC };

  // 1a. agents.defaults — deep merge (add new code-defined defaults)
  if (incomingOC.agents?.defaults && result.agents) {
    const { result: mergedDefaults, changes } = deepAddNew(
      result.agents.defaults || {},
      incomingOC.agents.defaults,
      'agents.defaults'
    );
    result.agents = { ...result.agents, defaults: mergedDefaults };
    allChanges.push(...changes);
  }

  // 1b. agents.list — never touch

  // 1c. tools — add new fields from incoming
  if (incomingOC.tools) {
    const { result: mergedTools, changes } = deepAddNew(result.tools || {}, incomingOC.tools, 'tools');
    result.tools = mergedTools;
    allChanges.push(...changes);
  }

  // 1d. commands — add new fields from incoming
  if (incomingOC.commands) {
    const { result: mergedCmds, changes } = deepAddNew(result.commands || {}, incomingOC.commands, 'commands');
    result.commands = mergedCmds;
    allChanges.push(...changes);
  }

  // 1e. gateway — add new fields, keep user values
  if (incomingOC.gateway) {
    const { result: mergedGw, changes } = deepAddNew(result.gateway || {}, incomingOC.gateway, 'gateway');
    result.gateway = mergedGw;
    allChanges.push(...changes);
  }

  // 1f. plugins.entries — add new entries, keep existing
  if (incomingOC.plugins?.entries) {
    if (!result.plugins) result.plugins = {};
    if (!result.plugins.entries) result.plugins.entries = {};
    for (const entryId of Object.keys(incomingOC.plugins.entries)) {
      if (!(entryId in result.plugins.entries)) {
        result.plugins.entries[entryId] = incomingOC.plugins.entries[entryId];
        allChanges.push(`plugins.entries: +${entryId}`);
      }
    }
  }

  // 1g. New top-level keys from incoming
  for (const key of Object.keys(incomingOC)) {
    if (!(key in result)) {
      result[key] = incomingOC[key];
      allChanges.push(`+ ${key}`);
    }
  }

  if (allChanges.length > 0) {
    console.log('  openclaw.json:');
    for (const ch of allChanges) {
      console.log(`    ${ch}`);
    }
    if (!dryRun) {
      writeFileSync(OPENCLAW_JSON, JSON.stringify(result, null, 2) + '\n');
    }
    totalUpdated++;
  } else {
    totalUnchanged++;
  }
} else if (!existingOC && incomingOC) {
  console.log('  openclaw.json: created from incoming');
  if (!dryRun) {
    mkdirSync(dirname(OPENCLAW_JSON), { recursive: true });
    writeFileSync(OPENCLAW_JSON, JSON.stringify(incomingOC, null, 2) + '\n');
  }
  totalUpdated++;
} else {
  totalUnchanged++;
}

// ── 2. Sync models.json ──

const existingModels = readJson(MODELS_JSON);
const incomingModels = getIncomingModels();

if (existingModels && incomingModels) {
  const allChanges = [];
  const result = { ...existingModels };

  // 2a. providers — add new providers, keep existing; for existing providers add new models
  if (incomingModels.providers) {
    if (!result.providers) result.providers = {};
    for (const providerId of Object.keys(incomingModels.providers)) {
      if (!(providerId in result.providers)) {
        result.providers[providerId] = incomingModels.providers[providerId];
        allChanges.push(`providers: +${providerId}`);
      } else {
        // Existing provider — add new model entries and new provider-level fields
        const existingProvider = result.providers[providerId];
        const incomingProvider = incomingModels.providers[providerId];
        if (existingProvider.models && incomingProvider.models &&
            typeof existingProvider.models === 'object' && typeof incomingProvider.models === 'object') {
          for (const modelKey of Object.keys(incomingProvider.models)) {
            if (!(modelKey in existingProvider.models)) {
              existingProvider.models[modelKey] = incomingProvider.models[modelKey];
              allChanges.push(`providers.${providerId}.models: +${modelKey}`);
            }
          }
        }
        for (const key of Object.keys(incomingProvider)) {
          if (key !== 'models' && !(key in existingProvider)) {
            existingProvider[key] = incomingProvider[key];
            allChanges.push(`providers.${providerId}: +${key}`);
          }
        }
      }
    }
  }

  // 2b. default — keep user value, only set if missing
  if (incomingModels.default && !result.default) {
    result.default = incomingModels.default;
    allChanges.push(`default: set to ${incomingModels.default}`);
  }

  // 2c. New top-level keys
  for (const key of Object.keys(incomingModels)) {
    if (!(key in result) && key !== 'providers' && key !== 'default') {
      result[key] = incomingModels[key];
      allChanges.push(`+ ${key}`);
    }
  }

  if (allChanges.length > 0) {
    console.log('  models.json:');
    for (const ch of allChanges) {
      console.log(`    ${ch}`);
    }
    if (!dryRun) {
      writeFileSync(MODELS_JSON, JSON.stringify(result, null, 2) + '\n');
    }
    totalUpdated++;
  } else {
    totalUnchanged++;
  }
} else if (!existingModels && incomingModels) {
  console.log('  models.json: created from incoming');
  if (!dryRun) {
    writeFileSync(MODELS_JSON, JSON.stringify(incomingModels, null, 2) + '\n');
  }
  totalUpdated++;
} else {
  totalUnchanged++;
}

// ── Summary ──

console.log(`\n${dryRun ? '[DRY-RUN] ' : ''}=== Summary ===`);
console.log(`  Updated:   ${totalUpdated}`);
console.log(`  Unchanged: ${totalUnchanged}`);

if (dryRun) {
  console.log(`\n[DRY-RUN] No changes were made. Run without --dry-run to apply.`);
}
