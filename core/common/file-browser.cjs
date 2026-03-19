'use strict'
/**
 * FileBrowser — 安全的目录遍历和文件读取
 *
 * 职责：项目文件浏览 + Agent workspace 统计
 */
const { readdirSync, readFileSync, existsSync, statSync } = require('fs')
const { join, resolve } = require('path')

const SKIP_DIRS = new Set(['node_modules', '.next', '.git', '__pycache__', '.turbo', '.vercel'])
const MAX_ENTRIES = 500

/**
 * 安全列出目录内容（防路径穿越）
 * @param {string} baseDir - 基础目录（安全边界）
 * @param {string} subDir - 子目录路径
 * @returns {{ entries: Array, currentDir: string, breadcrumb: string[], truncated?: boolean } | { error: string }}
 */
function listDirectory(baseDir, subDir) {
  const targetDir = subDir ? resolve(baseDir, subDir) : baseDir
  if (!targetDir.startsWith(baseDir + '/') && targetDir !== baseDir) {
    return { error: 'Invalid path' }
  }

  if (!existsSync(targetDir) || !statSync(targetDir).isDirectory()) {
    return { entries: [], currentDir: subDir, breadcrumb: [] }
  }

  const rawEntries = readdirSync(targetDir, { withFileTypes: true })
  const filtered = rawEntries.filter(e => !e.name.startsWith('.') && !SKIP_DIRS.has(e.name))

  filtered.sort((a, b) => {
    if (a.isDirectory() && !b.isDirectory()) return -1
    if (!a.isDirectory() && b.isDirectory()) return 1
    return a.name.localeCompare(b.name)
  })

  const truncated = filtered.length > MAX_ENTRIES
  const limited = truncated ? filtered.slice(0, MAX_ENTRIES) : filtered

  const entries = limited.map(entry => {
    const fullPath = join(targetDir, entry.name)
    const relativePath = subDir ? `${subDir}/${entry.name}` : entry.name

    if (entry.isDirectory()) {
      let childCount = 0
      try {
        childCount = readdirSync(fullPath).filter(n => !n.startsWith('.') && !SKIP_DIRS.has(n)).length
      } catch { /* permission denied */ }
      return { name: entry.name, type: 'directory', path: relativePath, childCount }
    }
    let size
    try { size = statSync(fullPath).size } catch { /* ignore */ }
    return { name: entry.name, type: 'file', path: relativePath, size }
  })

  const breadcrumb = subDir ? subDir.split('/').filter(Boolean) : []
  return { entries, currentDir: subDir, breadcrumb, truncated }
}

/**
 * 读取文件内容（带大小限制）
 * @param {string} baseDir - 基础目录（安全边界）
 * @param {string} filePath - 相对文件路径
 * @param {number} [maxSize=1000000] - 最大文件大小
 * @returns {{ content: string, size?: number } | { error: string }}
 */
function getFileContent(baseDir, filePath, maxSize = 1_000_000) {
  const fullPath = resolve(baseDir, filePath)
  if (!fullPath.startsWith(baseDir + '/') && fullPath !== baseDir) {
    return { error: 'Invalid path' }
  }
  if (!existsSync(fullPath)) return { error: 'File not found' }
  try {
    const stat = statSync(fullPath)
    if (stat.isDirectory()) return { error: 'Is a directory' }
    if (stat.size > maxSize) {
      return { content: `(File too large to preview, > ${Math.round(maxSize / 1000000)}MB)`, size: stat.size }
    }
    const content = readFileSync(fullPath, 'utf-8')
    return { content, size: stat.size }
  } catch {
    return { content: '(Binary file, cannot preview)' }
  }
}

/**
 * 列出 agent workspace 统计信息
 * @param {string} workspacesDir - workspaces 目录
 * @param {string[]} agentIds - 要检查的 agent ID 列表
 * @returns {Array<{agentId: string, fileCount: number, totalSize: number}>}
 */
function listAgentWorkspaces(workspacesDir, agentIds) {
  const agents = []
  for (const agentId of agentIds) {
    const wsDir = join(workspacesDir, agentId)
    if (!existsSync(wsDir)) continue
    const { count, size } = countDirStats(wsDir)
    if (count === 0) continue
    agents.push({ agentId, fileCount: count, totalSize: size })
  }
  return agents
}

/**
 * 递归统计目录文件数和大小
 * @param {string} dir
 * @param {number} [maxDepth=6]
 * @param {number} [depth=0]
 * @returns {{ count: number, size: number }}
 */
function countDirStats(dir, maxDepth = 6, depth = 0) {
  if (depth > maxDepth) return { count: 0, size: 0 }
  let count = 0
  let size = 0
  try {
    const entries = readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
      if (entry.name.startsWith('.') || SKIP_DIRS.has(entry.name)) continue
      const fullPath = join(dir, entry.name)
      if (entry.isDirectory()) {
        const sub = countDirStats(fullPath, maxDepth, depth + 1)
        count += sub.count
        size += sub.size
      } else {
        count++
        try { size += statSync(fullPath).size } catch { /* ignore */ }
      }
    }
  } catch { /* permission denied */ }
  return { count, size }
}

module.exports = { listDirectory, getFileContent, listAgentWorkspaces, countDirStats }
