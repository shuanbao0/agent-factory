#!/usr/bin/env node
/**
 * Cleanup Invalid Outputs — scan workspaces for empty/template/duplicate files.
 *
 * Usage:
 *   node scripts/cleanup-invalid-outputs.mjs                 # dry-run by default
 *   node scripts/cleanup-invalid-outputs.mjs --execute       # actually delete
 *   node scripts/cleanup-invalid-outputs.mjs --workspace novel-writer
 */
import { readdirSync, statSync, readFileSync, unlinkSync, existsSync } from 'fs'
import { join, resolve, basename } from 'path'
import { createHash } from 'crypto'
import { fileURLToPath } from 'url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const PROJECT_ROOT = resolve(__dirname, '..')
const WORKSPACES_DIR = join(PROJECT_ROOT, 'workspaces')

const args = process.argv.slice(2)
const dryRun = !args.includes('--execute')
const targetWorkspace = args.find((a, i, arr) => arr[i - 1] === '--workspace') || null

const MIN_FILE_SIZE = 500  // bytes
const TEMPLATE_PATTERN = /\$\{[^}]+\}/

function scanWorkspace(workspaceDir, workspaceName) {
  const issues = []
  const hashes = new Map()  // hash → [paths]

  function walk(dir) {
    let entries
    try { entries = readdirSync(dir, { withFileTypes: true }) } catch { return }
    for (const entry of entries) {
      const fullPath = join(dir, entry.name)
      if (entry.isDirectory()) {
        walk(fullPath)
        continue
      }
      if (!entry.isFile()) continue
      // Skip dotfiles and common non-content files
      if (entry.name.startsWith('.') || entry.name === 'README.md') continue

      try {
        const stat = statSync(fullPath)
        const relPath = fullPath.replace(PROJECT_ROOT + '/', '')

        // Check 1: Too small
        if (stat.size < MIN_FILE_SIZE) {
          issues.push({ path: relPath, fullPath, reason: `文件过小 (${stat.size}B < ${MIN_FILE_SIZE}B)` })
          continue
        }

        // Read content for further checks
        const content = readFileSync(fullPath, 'utf8')

        // Check 2: Unrendered template variables
        if (TEMPLATE_PATTERN.test(content.slice(0, 5000))) {
          issues.push({ path: relPath, fullPath, reason: '含未渲染模板变量 ${...}' })
          continue
        }

        // Check 3: Hash duplicate detection
        const hash = createHash('md5').update(content).digest('hex')
        if (hashes.has(hash)) {
          hashes.get(hash).push(relPath)
          issues.push({ path: relPath, fullPath, reason: `内容与 ${hashes.get(hash)[0]} 完全重复` })
        } else {
          hashes.set(hash, [relPath])
        }
      } catch (err) {
        // Skip unreadable files
      }
    }
  }

  walk(workspaceDir)
  return issues
}

// Main
console.log(`🔍 扫描无效产出文件${dryRun ? ' (dry-run 模式，不会删除)' : ' (执行模式，将删除无效文件)'}`)
console.log()

if (!existsSync(WORKSPACES_DIR)) {
  console.log('workspaces/ 目录不存在，无需清理')
  process.exit(0)
}

const workspaces = targetWorkspace
  ? [targetWorkspace]
  : readdirSync(WORKSPACES_DIR, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name)

let totalIssues = 0
let totalDeleted = 0

for (const ws of workspaces) {
  const wsDir = join(WORKSPACES_DIR, ws)
  if (!existsSync(wsDir)) {
    console.log(`⚠️  工作空间 ${ws} 不存在，跳过`)
    continue
  }

  const issues = scanWorkspace(wsDir, ws)
  if (issues.length === 0) continue

  console.log(`📁 ${ws}: 发现 ${issues.length} 个问题文件`)
  for (const issue of issues) {
    console.log(`   ❌ ${issue.path} — ${issue.reason}`)
    if (!dryRun) {
      try {
        unlinkSync(issue.fullPath)
        totalDeleted++
      } catch (err) {
        console.log(`      删除失败: ${err.message}`)
      }
    }
  }
  totalIssues += issues.length
  console.log()
}

console.log(`📊 总计: ${totalIssues} 个问题文件${dryRun ? '' : `，已删除 ${totalDeleted} 个`}`)
if (dryRun && totalIssues > 0) {
  console.log(`\n💡 使用 --execute 参数执行实际删除：`)
  console.log(`   node scripts/cleanup-invalid-outputs.mjs --execute`)
}
