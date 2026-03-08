#!/usr/bin/env node
/**
 * migrate-sync-builtin.mjs — Unified sync from builtin templates to existing agents
 *
 * Replaces migrate-sync-peers.mjs and migrate-sync-templates.mjs.
 * For each agent created from a builtin template, syncs:
 *   - peers:       merge (union) — preserves user-added peers
 *   - skills:      merge (union) — preserves user-installed skills, ensures peer-status
 *   - AGENTS.md:   replace (preserves base-rules marker blocks)
 *   - SOUL.md:     replace (preserves base-soul marker blocks)
 *   - IDENTITY.md: replace if template has one and content differs
 *
 * Does NOT sync: model, name, description, department (user may have customized).
 *
 * Usage:
 *   node scripts/migrate-sync-builtin.mjs              # sync all agents
 *   node scripts/migrate-sync-builtin.mjs novel-writer  # sync single agent
 *   node scripts/migrate-sync-builtin.mjs --dry-run     # preview changes
 */

import { existsSync, readFileSync, writeFileSync, readdirSync, copyFileSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const AGENTS_DIR = join(ROOT, 'agents');
const TEMPLATES_DIR = join(ROOT, 'templates', 'builtin');

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const targetAgent = args.find(a => !a.startsWith('--')) || null;

// ── Base-rules markers (must match inject-base-rules.mjs / ui/src/lib/base-rules.ts) ──

const MARKERS = {
  agentsBegin:   '<!-- BASE-RULES:BEGIN -->',
  agentsEnd:     '<!-- BASE-RULES:END -->',
  reminderBegin: '<!-- BASE-RULES-REMINDER:BEGIN -->',
  reminderEnd:   '<!-- BASE-RULES-REMINDER:END -->',
  soulBegin:     '<!-- BASE-SOUL:BEGIN -->',
  soulEnd:       '<!-- BASE-SOUL:END -->',
};

// ── Helpers ──

function extractMarkerBlock(content, beginMarker, endMarker) {
  const si = content.indexOf(beginMarker);
  if (si === -1) return null;
  const ei = content.indexOf(endMarker, si);
  if (ei === -1) return null;
  return content.slice(si, ei + endMarker.length);
}

function stripMarkerBlock(content, beginMarker, endMarker) {
  const si = content.indexOf(beginMarker);
  if (si === -1) return content;
  const ei = content.indexOf(endMarker, si);
  if (ei === -1) return content;
  const before = content.slice(0, si);
  const after = content.slice(ei + endMarker.length).replace(/^\n{1,2}/, '\n');
  return (before + after).replace(/^\n+/, '');
}

function getTemplateContent(content) {
  // Strip all base-rules marker blocks to get the "template portion"
  let cleaned = content;
  cleaned = stripMarkerBlock(cleaned, MARKERS.agentsBegin, MARKERS.agentsEnd);
  cleaned = stripMarkerBlock(cleaned, MARKERS.reminderBegin, MARKERS.reminderEnd);
  cleaned = stripMarkerBlock(cleaned, MARKERS.soulBegin, MARKERS.soulEnd);
  return cleaned.trim();
}

function rebuildWithMarkers(newTemplateContent, existingContent, fileType) {
  // Rebuild file: new template content + preserved marker blocks from existing
  const parts = [];

  if (fileType === 'AGENTS.md') {
    // Extract existing base-rules blocks
    const agentsBlock = extractMarkerBlock(existingContent, MARKERS.agentsBegin, MARKERS.agentsEnd);
    const reminderBlock = extractMarkerBlock(existingContent, MARKERS.reminderBegin, MARKERS.reminderEnd);

    if (agentsBlock) {
      parts.push(agentsBlock, '');
    }
    parts.push(newTemplateContent);
    if (reminderBlock) {
      parts.push('', reminderBlock);
    }
  } else if (fileType === 'SOUL.md') {
    const soulBlock = extractMarkerBlock(existingContent, MARKERS.soulBegin, MARKERS.soulEnd);

    if (soulBlock) {
      parts.push(soulBlock, '');
    }
    parts.push(newTemplateContent);
  }

  return parts.join('\n') + '\n';
}

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

function arrayUnion(existing, incoming) {
  const set = new Set(existing);
  const added = incoming.filter(item => !set.has(item));
  return { merged: [...existing, ...added], added };
}

// ── Main ──

if (!existsSync(AGENTS_DIR)) {
  console.log('No agents/ directory found. Nothing to sync.');
  process.exit(0);
}

if (!existsSync(TEMPLATES_DIR)) {
  console.log('No templates/builtin/ directory found. Nothing to sync.');
  process.exit(0);
}

// Build template map: templateId -> { template.json, dir path }
const templateMap = new Map();
for (const entry of readdirSync(TEMPLATES_DIR, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const tplPath = join(TEMPLATES_DIR, entry.name, 'template.json');
  const tpl = readJson(tplPath);
  if (!tpl) continue;
  templateMap.set(tpl.id, { tpl, dir: join(TEMPLATES_DIR, entry.name) });
}

// Gather agent dirs to process
const agentDirs = targetAgent
  ? [targetAgent]
  : readdirSync(AGENTS_DIR, { withFileTypes: true })
      .filter(d => d.isDirectory() && !d.name.startsWith('.'))
      .map(d => d.name);

console.log(`${dryRun ? '[DRY-RUN] ' : ''}=== Sync builtin templates → agents/ ===\n`);

let totalUpdated = 0;
let totalUnchanged = 0;
let totalSkipped = 0;

for (const agentId of agentDirs) {
  const agentJsonPath = join(AGENTS_DIR, agentId, 'agent.json');
  if (!existsSync(agentJsonPath)) {
    if (targetAgent) console.log(`  Agent "${agentId}" not found.`);
    totalSkipped++;
    continue;
  }

  const agent = readJson(agentJsonPath);
  if (!agent) {
    console.log(`  [SKIP] ${agentId}: invalid agent.json`);
    totalSkipped++;
    continue;
  }

  const templateId = agent.templateId || agent.id;
  const tmpl = templateMap.get(templateId);
  if (!tmpl) {
    totalSkipped++;
    continue;
  }

  const { tpl, dir: tplDir } = tmpl;
  const changes = [];

  // ── 1. Sync peers (merge/union) ──
  const templatePeers = tpl.defaults?.peers || [];
  if (templatePeers.length > 0) {
    const currentPeers = agent.peers || [];
    const { merged, added } = arrayUnion(currentPeers, templatePeers);
    if (added.length > 0) {
      agent.peers = merged;
      changes.push(`peers:      + ${added.join(', ')}  (${added.length} added)`);
    }
  }

  // ── 2. Sync skills (merge/union, ensure peer-status) ──
  const templateSkills = tpl.defaults?.skills || [];
  const currentSkills = agent.skills || [];
  // Always ensure peer-status is present
  const requiredSkills = [...new Set([...templateSkills, 'peer-status'])];
  const { merged: mergedSkills, added: addedSkills } = arrayUnion(currentSkills, requiredSkills);
  if (addedSkills.length > 0) {
    agent.skills = mergedSkills;
    changes.push(`skills:     + ${addedSkills.join(', ')}  (${addedSkills.length} added)`);
  }

  // ── 3. Sync AGENTS.md (replace, preserve base-rules blocks) ──
  const tplAgentsMd = readText(join(tplDir, 'AGENTS.md'));
  if (tplAgentsMd) {
    const agentsMdPath = join(AGENTS_DIR, agentId, 'AGENTS.md');
    const currentAgentsMd = readText(agentsMdPath) || '';
    const currentBody = getTemplateContent(currentAgentsMd);
    const newBody = tplAgentsMd.trim();

    if (currentBody !== newBody) {
      if (!dryRun) {
        if (existsSync(agentsMdPath)) {
          copyFileSync(agentsMdPath, agentsMdPath + '.bak');
        }
        const finalContent = currentAgentsMd
          ? rebuildWithMarkers(newBody, currentAgentsMd, 'AGENTS.md')
          : newBody + '\n';
        writeFileSync(agentsMdPath, finalContent);
      }
      changes.push('AGENTS.md:  updated (backup → AGENTS.md.bak)');
    }
  }

  // ── 4. Sync SOUL.md (replace, preserve base-soul blocks) ──
  const tplSoulMd = readText(join(tplDir, 'SOUL.md'));
  if (tplSoulMd) {
    const soulMdPath = join(AGENTS_DIR, agentId, 'SOUL.md');
    const currentSoulMd = readText(soulMdPath) || '';
    const currentBody = getTemplateContent(currentSoulMd);
    const newBody = tplSoulMd.trim();

    if (currentBody !== newBody) {
      if (!dryRun) {
        if (existsSync(soulMdPath)) {
          copyFileSync(soulMdPath, soulMdPath + '.bak');
        }
        const finalContent = currentSoulMd
          ? rebuildWithMarkers(newBody, currentSoulMd, 'SOUL.md')
          : newBody + '\n';
        writeFileSync(soulMdPath, finalContent);
      }
      changes.push('SOUL.md:    updated (backup → SOUL.md.bak)');
    }
  }

  // ── 5. Sync IDENTITY.md (replace if different) ──
  const tplIdentityMd = readText(join(tplDir, 'IDENTITY.md'));
  if (tplIdentityMd) {
    const identityMdPath = join(AGENTS_DIR, agentId, 'IDENTITY.md');
    const currentIdentityMd = readText(identityMdPath) || '';

    if (currentIdentityMd.trim() !== tplIdentityMd.trim()) {
      if (!dryRun) {
        if (existsSync(identityMdPath)) {
          copyFileSync(identityMdPath, identityMdPath + '.bak');
        }
        writeFileSync(identityMdPath, tplIdentityMd);
      }
      changes.push('IDENTITY.md: updated (backup → IDENTITY.md.bak)');
    }
  }

  // ── Write agent.json if peers/skills changed ──
  if (changes.some(c => c.startsWith('peers:') || c.startsWith('skills:'))) {
    agent.updatedAt = new Date().toISOString();
    if (!dryRun) {
      writeFileSync(agentJsonPath, JSON.stringify(agent, null, 2) + '\n');
    }
  }

  // ── Output ──
  if (changes.length > 0) {
    console.log(`  ${agentId}:`);
    for (const c of changes) {
      console.log(`    ${c}`);
    }
    totalUpdated++;
  } else {
    totalUnchanged++;
  }
}

console.log(`\n${dryRun ? '[DRY-RUN] ' : ''}=== Summary ===`);
console.log(`  Updated:   ${totalUpdated}`);
console.log(`  Unchanged: ${totalUnchanged}`);
console.log(`  Skipped:   ${totalSkipped}`);

if (totalUpdated > 0 && !dryRun) {
  console.log(`\nBackups saved as *.bak. Run "node scripts/inject-base-rules.mjs" to re-inject base-rules.`);
}

if (dryRun) {
  console.log(`\n[DRY-RUN] No changes were made. Run without --dry-run to apply.`);
}
