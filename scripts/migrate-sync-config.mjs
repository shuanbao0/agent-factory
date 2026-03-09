#!/usr/bin/env node
/**
 * migrate-sync-config.mjs — Smart sync for config/ files during update
 *
 * Handles intelligent merging of config files that `agent-factory update`
 * would otherwise skip (existing departments) or blindly overwrite (budget.json).
 *
 * Sync rules:
 *   config/departments/{id}/config.json  — smart merge (new fields added, user values preserved)
 *   config/departments/{id}/mission.md   — write only if missing
 *   config/departments/{id}/state.json   — never touch (runtime data)
 *   config/departments/{id}/report.md    — never touch (runtime generated)
 *   config/departments/{id}/ceo-directives.json — never touch (runtime data)
 *   config/budget.json                   — smart merge (new fields added, user limits preserved)
 *
 * Usage:
 *   node scripts/migrate-sync-config.mjs              # sync all departments
 *   node scripts/migrate-sync-config.mjs novel         # sync single department
 *   node scripts/migrate-sync-config.mjs --dry-run     # preview changes
 */

import { existsSync, readFileSync, writeFileSync, readdirSync, mkdirSync, cpSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const DEPARTMENTS_DIR = join(ROOT, 'config', 'departments');
const DEPARTMENTS_JSON = join(ROOT, 'config', 'departments.json');
const BUDGET_JSON = join(ROOT, 'config', 'budget.json');
const UPDATE_DIR = process.env.AF_UPDATE_DIR || null;  // tmpDir from agent-factory update

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const targetDept = args.find(a => !a.startsWith('--')) || null;

// ── Helpers ──

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf-8'));
  } catch {
    return null;
  }
}

function readText(path) {
  return existsSync(path) ? readFileSync(path, 'utf-8') : null;
}

/**
 * Deep merge incoming into existing:
 * - Scalar fields: keep existing value (user may have customized)
 * - Arrays: union merge (add new items, keep existing)
 * - Objects: recurse
 * - New keys in incoming: add to existing
 */
function deepMergePreserve(existing, incoming) {
  if (existing === null || existing === undefined) return incoming;
  if (incoming === null || incoming === undefined) return existing;

  // Both are arrays → union
  if (Array.isArray(existing) && Array.isArray(incoming)) {
    const set = new Set(existing);
    const added = incoming.filter(item => !set.has(item));
    return { value: [...existing, ...added], added };
  }

  // Both are plain objects → recurse
  if (typeof existing === 'object' && typeof incoming === 'object' &&
      !Array.isArray(existing) && !Array.isArray(incoming)) {
    const result = { ...existing };
    const changes = [];

    for (const key of Object.keys(incoming)) {
      if (!(key in existing)) {
        // New key from incoming → add it
        result[key] = incoming[key];
        changes.push(`+${key}`);
      } else if (typeof existing[key] === 'object' && typeof incoming[key] === 'object' &&
                 existing[key] !== null && incoming[key] !== null) {
        // Both are objects/arrays → recurse
        const merged = deepMergePreserve(existing[key], incoming[key]);
        if (merged.added || merged.changes) {
          result[key] = merged.value || merged.result;
          if (merged.added) changes.push(`${key}: +${merged.added.join(', ')}`);
          if (merged.changes) changes.push(...merged.changes.map(c => `${key}.${c}`));
        }
      }
      // Scalar: keep existing (user value preserved)
    }

    return { result, changes };
  }

  // Scalars: keep existing
  return { value: existing };
}

/**
 * Merge department config.json with specific field handling
 */
function mergeDeptConfig(existing, incoming) {
  const result = { ...existing };
  const changes = [];

  for (const key of Object.keys(incoming)) {
    if (!(key in existing)) {
      // New top-level field → add
      result[key] = incoming[key];
      changes.push(`+ ${key}: ${JSON.stringify(incoming[key])}`);
      continue;
    }

    // agents array: union merge
    if (key === 'agents' && Array.isArray(existing[key]) && Array.isArray(incoming[key])) {
      const set = new Set(existing[key]);
      const added = incoming[key].filter(a => !set.has(a));
      if (added.length > 0) {
        result[key] = [...existing[key], ...added];
        changes.push(`agents: +${added.join(', ')}`);
      }
      continue;
    }

    // workflow: always update from incoming (code-defined config, not user data)
    if (key === 'workflow' && typeof incoming[key] === 'object') {
      if (JSON.stringify(existing[key]) !== JSON.stringify(incoming[key])) {
        result[key] = incoming[key];
        changes.push('workflow: updated');
      }
      continue;
    }

    // kpis object: add new kpis, keep existing targets
    if (key === 'kpis' && typeof existing[key] === 'object' && typeof incoming[key] === 'object') {
      const kpis = { ...existing[key] };
      for (const kpiKey of Object.keys(incoming[key])) {
        if (!(kpiKey in kpis)) {
          kpis[kpiKey] = incoming[key][kpiKey];
          changes.push(`kpis: +${kpiKey}`);
        }
      }
      result[key] = kpis;
      continue;
    }

    // budget object: add new fields, keep existing values
    if (key === 'budget' && typeof existing[key] === 'object' && typeof incoming[key] === 'object') {
      const budget = { ...existing[key] };
      for (const bKey of Object.keys(incoming[key])) {
        if (!(bKey in budget)) {
          budget[bKey] = incoming[key][bKey];
          changes.push(`budget: +${bKey}`);
        }
      }
      result[key] = budget;
      continue;
    }

    // Other objects: add new keys only
    if (typeof existing[key] === 'object' && typeof incoming[key] === 'object' &&
        !Array.isArray(existing[key]) && existing[key] !== null && incoming[key] !== null) {
      const obj = { ...existing[key] };
      for (const subKey of Object.keys(incoming[key])) {
        if (!(subKey in obj)) {
          obj[subKey] = incoming[key][subKey];
          changes.push(`${key}: +${subKey}`);
        }
      }
      result[key] = obj;
      continue;
    }

    // Scalars (name, head, id, enabled, interval): keep existing
  }

  return { result, changes };
}

/**
 * Merge budget.json: add new fields, preserve user limits
 */
function mergeBudget(existing, incoming) {
  const result = { ...existing };
  const changes = [];

  for (const key of Object.keys(incoming)) {
    if (!(key in existing)) {
      result[key] = incoming[key];
      changes.push(`+ ${key}: ${JSON.stringify(incoming[key])}`);
    } else if (typeof existing[key] === 'object' && typeof incoming[key] === 'object' &&
               !Array.isArray(existing[key]) && existing[key] !== null) {
      // Recurse into nested objects (e.g., company: { dailyTokenLimit, ... })
      const obj = { ...existing[key] };
      for (const subKey of Object.keys(incoming[key])) {
        if (!(subKey in obj)) {
          obj[subKey] = incoming[key][subKey];
          changes.push(`${key}: +${subKey}`);
        }
      }
      result[key] = obj;
    }
  }

  return { result, changes };
}

// ── Get reference configs from departments.json ──

function getReferenceDeptConfig(deptId) {
  // Priority 1: AF_UPDATE_DIR (new version config with full fields including workflow)
  if (UPDATE_DIR) {
    const incomingPath = join(UPDATE_DIR, 'config', 'departments', deptId, 'config.json');
    const incoming = readJson(incomingPath);
    if (incoming) return incoming;
  }
  // Priority 2: departments.json (standalone run fallback, display fields only)
  const deptsData = readJson(DEPARTMENTS_JSON);
  if (!deptsData?.departments) return null;
  return deptsData.departments.find(d => d.id === deptId) || null;
}

// ── Main ──

console.log(`${dryRun ? '[DRY-RUN] ' : ''}=== Sync config/ files ===\n`);
if (UPDATE_DIR) {
  console.log(`  Using incoming files from: ${UPDATE_DIR}\n`);
}

let totalUpdated = 0;
let totalUnchanged = 0;
let totalSkipped = 0;

// ── 0. When running during update (AF_UPDATE_DIR set): merge departments.json & copy new dept dirs ──

if (UPDATE_DIR) {
  // 0a. Smart-merge departments.json
  const newDeptJsonPath = join(UPDATE_DIR, 'config', 'departments.json');
  if (existsSync(newDeptJsonPath)) {
    const newDepts = readJson(newDeptJsonPath);
    if (newDepts?.departments) {
      if (!existsSync(DEPARTMENTS_JSON)) {
        // No existing file — just copy
        if (!dryRun) {
          mkdirSync(dirname(DEPARTMENTS_JSON), { recursive: true });
          writeFileSync(DEPARTMENTS_JSON, JSON.stringify(newDepts, null, 2) + '\n');
        }
        console.log('  departments.json: created from incoming');
        totalUpdated++;
      } else {
        const currentDepts = readJson(DEPARTMENTS_JSON);
        if (currentDepts?.departments) {
          const currentMap = new Map(currentDepts.departments.map(d => [d.id, d]));
          let changed = false;
          for (const dept of newDepts.departments) {
            if (!currentMap.has(dept.id)) {
              currentDepts.departments.push(dept);
              console.log(`  departments.json: + department ${dept.name} (${dept.id})`);
              changed = true;
            } else {
              const existing = currentMap.get(dept.id);
              for (const key of Object.keys(dept)) {
                if (!(key in existing)) {
                  existing[key] = dept[key];
                  console.log(`  departments.json: ${dept.id} + ${key}`);
                  changed = true;
                }
              }
            }
          }
          if (changed) {
            if (!dryRun) {
              writeFileSync(DEPARTMENTS_JSON, JSON.stringify(currentDepts, null, 2) + '\n');
            }
            totalUpdated++;
          } else {
            totalUnchanged++;
          }
        }
      }
    }
  }

  // 0b. Copy new department directories from UPDATE_DIR
  const incomingDeptsDir = join(UPDATE_DIR, 'config', 'departments');
  if (existsSync(incomingDeptsDir)) {
    mkdirSync(DEPARTMENTS_DIR, { recursive: true });
    for (const entry of readdirSync(incomingDeptsDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const dstDir = join(DEPARTMENTS_DIR, entry.name);
      if (!existsSync(dstDir)) {
        const srcDir = join(incomingDeptsDir, entry.name);
        if (!dryRun) {
          try {
            cpSync(srcDir, dstDir, { recursive: true });
          } catch {
            execSync(`cp -R "${srcDir}" "${DEPARTMENTS_DIR}/"`, { stdio: 'inherit' });
          }
        }
        console.log(`  + new department dir: ${entry.name}`);
        totalUpdated++;
      }
    }
  }

  // 0c. Smart-merge budget.json from UPDATE_DIR
  const incomingBudgetPath = join(UPDATE_DIR, 'config', 'budget.json');
  if (existsSync(incomingBudgetPath)) {
    const incomingBudget = readJson(incomingBudgetPath);
    const existingBudget = readJson(BUDGET_JSON);
    if (incomingBudget) {
      if (!existingBudget) {
        if (!dryRun) {
          writeFileSync(BUDGET_JSON, JSON.stringify(incomingBudget, null, 2) + '\n');
        }
        console.log('  budget.json: created from incoming');
        totalUpdated++;
      } else {
        const { result, changes } = mergeBudget(existingBudget, incomingBudget);
        if (changes.length > 0) {
          console.log('  budget.json (from incoming):');
          for (const ch of changes) {
            console.log(`    ${ch}`);
          }
          if (!dryRun) {
            writeFileSync(BUDGET_JSON, JSON.stringify(result, null, 2) + '\n');
          }
          totalUpdated++;
        } else {
          totalUnchanged++;
        }
      }
    }
  }

  console.log('');
}

// ── 1. Sync department configs ──

if (existsSync(DEPARTMENTS_DIR)) {
  const deptDirs = targetDept
    ? [targetDept]
    : readdirSync(DEPARTMENTS_DIR, { withFileTypes: true })
        .filter(d => d.isDirectory() && !d.name.startsWith('.'))
        .map(d => d.name);

  for (const deptId of deptDirs) {
    const deptDir = join(DEPARTMENTS_DIR, deptId);
    if (!existsSync(deptDir)) {
      if (targetDept) console.log(`  Department "${deptId}" not found.`);
      totalSkipped++;
      continue;
    }

    const configPath = join(deptDir, 'config.json');
    const missionPath = join(deptDir, 'mission.md');
    const changes = [];

    // ── 1a. config.json — smart merge ──
    const existingConfig = readJson(configPath);
    const referenceConfig = getReferenceDeptConfig(deptId);

    if (existingConfig && referenceConfig) {
      const { result, changes: mergeChanges } = mergeDeptConfig(existingConfig, referenceConfig);

      if (mergeChanges.length > 0) {
        if (!dryRun) {
          writeFileSync(configPath, JSON.stringify(result, null, 2) + '\n');
        }
        changes.push(`config.json: ${mergeChanges.join('; ')}`);
      }
    } else if (!existingConfig && referenceConfig) {
      // config.json missing entirely — create from reference
      if (!dryRun) {
        mkdirSync(deptDir, { recursive: true });
        writeFileSync(configPath, JSON.stringify(referenceConfig, null, 2) + '\n');
      }
      changes.push('config.json: created from departments.json');
    }

    // ── 1b. mission.md — write only if missing ──
    if (!existsSync(missionPath)) {
      // Create a default mission.md based on department name
      const name = existingConfig?.name || referenceConfig?.name || deptId;
      const defaultMission = `# ${name} Mission\n\nDepartment mission statement.\n`;
      if (!dryRun) {
        writeFileSync(missionPath, defaultMission);
      }
      changes.push('mission.md: created (was missing)');
    }

    // Note: state.json, report.md, ceo-directives.json are never touched

    // ── Output ──
    if (changes.length > 0) {
      console.log(`  ${deptId}:`);
      for (const c of changes) {
        console.log(`    ${c}`);
      }
      totalUpdated++;
    } else {
      totalUnchanged++;
    }
  }
} else {
  console.log('  No config/departments/ directory found. Skipping department sync.');
}

// ── 2. Sync budget.json (only when no specific department target and not during update) ──

if (!targetDept && !UPDATE_DIR && existsSync(BUDGET_JSON)) {
  // For budget.json, we can't easily get the "incoming" version after rsync.
  // This merge is defensive — it ensures the structure has expected fields.
  const expectedStructure = {
    company: {
      dailyTokenLimit: 5000000,
      monthlyTokenLimit: 100000000,
      alertThreshold: 0.8
    },
    overBudgetAction: 'pause_and_notify'
  };

  const existingBudget = readJson(BUDGET_JSON);
  if (existingBudget) {
    const { result, changes } = mergeBudget(existingBudget, expectedStructure);

    if (changes.length > 0) {
      console.log('  budget.json:');
      for (const c of changes) {
        console.log(`    ${c}`);
      }
      if (!dryRun) {
        writeFileSync(BUDGET_JSON, JSON.stringify(result, null, 2) + '\n');
      }
      totalUpdated++;
    } else {
      totalUnchanged++;
    }
  }
}

// ── Summary ──

console.log(`\n${dryRun ? '[DRY-RUN] ' : ''}=== Summary ===`);
console.log(`  Updated:   ${totalUpdated}`);
console.log(`  Unchanged: ${totalUnchanged}`);
console.log(`  Skipped:   ${totalSkipped}`);

if (dryRun) {
  console.log(`\n[DRY-RUN] No changes were made. Run without --dry-run to apply.`);
}
