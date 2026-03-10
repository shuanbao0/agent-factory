#!/usr/bin/env node
/**
 * postinstall 补丁脚本：自动修复 OpenClaw 的 enforceFinalTag 问题
 *
 * OpenClaw 2026.3.7+ 的 isReasoningTagProvider() 将 minimax 视为 reasoning tag provider，
 * 导致 enforceFinalTag 机制静默丢弃所有 MiniMax 模型输出。
 *
 * 此脚本在 npm install 后自动运行，检测并移除 isReasoningTagProvider 中的 minimax 判断行。
 * 当上游发布修复版本（>= 2026.4.0）后，脚本自动跳过。
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const FIXED_VERSION = "2026.4.0";
const TAG = "[patch-openclaw]";

function findOpenclawDir() {
  // Walk up from this script's location to find node_modules/openclaw
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 10; i++) {
    const candidate = join(dir, "node_modules", "openclaw");
    try {
      statSync(candidate);
      return candidate;
    } catch {
      // continue
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

function semverGte(a, b) {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) > (pb[i] || 0)) return true;
    if ((pa[i] || 0) < (pb[i] || 0)) return false;
  }
  return true; // equal
}

function walkJs(dir, files = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      walkJs(full, files);
    } else if (entry.name.endsWith(".js")) {
      files.push(full);
    }
  }
  return files;
}

function main() {
  const openclawDir = findOpenclawDir();
  if (!openclawDir) {
    console.log(`${TAG} openclaw not found in node_modules, skipping`);
    return;
  }

  // Check version
  let version;
  try {
    const pkg = JSON.parse(readFileSync(join(openclawDir, "package.json"), "utf8"));
    version = pkg.version;
  } catch {
    console.log(`${TAG} cannot read openclaw/package.json, skipping`);
    return;
  }

  if (semverGte(version, FIXED_VERSION)) {
    console.log(`${TAG} openclaw ${version} >= ${FIXED_VERSION}, no patch needed`);
    return;
  }

  console.log(`${TAG} openclaw ${version} < ${FIXED_VERSION}, checking for minimax patch...`);

  // Scan dist for files containing isReasoningTagProvider
  const distDir = join(openclawDir, "dist");
  let jsFiles;
  try {
    jsFiles = walkJs(distDir);
  } catch {
    console.log(`${TAG} dist/ directory not found, skipping`);
    return;
  }

  // Pattern: a line containing minimax inside isReasoningTagProvider
  // We match the specific line: if (normalized.includes("minimax")) return true;
  const minimaxLineRe = /^[\t ]*if\s*\(normalized\.includes\(["']minimax["']\)\)\s*return\s+true;\s*\r?\n/gm;

  let patchedCount = 0;

  for (const file of jsFiles) {
    const content = readFileSync(file, "utf8");

    // Only process files that have isReasoningTagProvider
    if (!content.includes("isReasoningTagProvider")) continue;
    if (!minimaxLineRe.test(content)) continue;

    // Reset regex lastIndex
    minimaxLineRe.lastIndex = 0;
    const patched = content.replace(minimaxLineRe, "");

    if (patched !== content) {
      writeFileSync(file, patched, "utf8");
      patchedCount++;
    }
  }

  if (patchedCount > 0) {
    console.log(`${TAG} patched ${patchedCount} file(s) — removed minimax from isReasoningTagProvider`);
  } else {
    console.log(`${TAG} no files needed patching (already patched or pattern not found)`);
  }
}

main();
