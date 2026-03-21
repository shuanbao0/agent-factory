'use strict'
/**
 * data-init.cjs — 初始化 data/ 目录结构
 *
 * 首次启动时从 config/ 复制种子文件到 data/config/，
 * 创建必要的运行时目录。幂等：已存在则跳过。
 */
const { existsSync, mkdirSync, copyFileSync, readdirSync, statSync } = require('fs')
const { join, dirname } = require('path')
const {
  DATA_DIR, CONFIG_DIR, AGENTS_DIR, WORKSPACES_DIR,
  PROJECTS_DIR, STATE_DIR, DEPARTMENTS_DIR,
  SOURCE_CONFIG_DIR, LOGS_DIR,
} = require('./paths.cjs')

/**
 * 需要从 SOURCE_CONFIG_DIR 复制到 CONFIG_DIR 的种子文件。
 * 这些文件在 git 中作为默认值，运行时会被修改。
 */
const SEED_FILES = [
  'budget.json',
  'departments.json',
  'mission.md',
]

/**
 * 确保 data/ 目录结构存在，复制种子配置文件。
 * 幂等操作：已存在的目录和文件不会被覆盖。
 */
function ensureDataDir() {
  // 创建顶级目录
  for (const dir of [DATA_DIR, CONFIG_DIR, AGENTS_DIR, WORKSPACES_DIR, PROJECTS_DIR, STATE_DIR, DEPARTMENTS_DIR, LOGS_DIR]) {
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  }

  // 复制种子文件到 data/config/
  for (const file of SEED_FILES) {
    const src = join(SOURCE_CONFIG_DIR, file)
    const dest = join(CONFIG_DIR, file)
    if (!existsSync(dest) && existsSync(src)) {
      mkdirSync(dirname(dest), { recursive: true })
      copyFileSync(src, dest)
    }
  }

  // 复制部门种子配置（departments/*/config.json + mission.md）
  const srcDeptDir = join(SOURCE_CONFIG_DIR, 'departments')
  if (existsSync(srcDeptDir)) {
    for (const entry of readdirSync(srcDeptDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      const deptId = entry.name
      const destDeptDir = join(DEPARTMENTS_DIR, deptId)
      if (!existsSync(destDeptDir)) mkdirSync(destDeptDir, { recursive: true })

      // 复制部门下的种子文件
      const srcDir = join(srcDeptDir, deptId)
      for (const file of readdirSync(srcDir)) {
        const srcFile = join(srcDir, file)
        const destFile = join(destDeptDir, file)
        if (!existsSync(destFile) && statSync(srcFile).isFile()) {
          copyFileSync(srcFile, destFile)
        }
      }
    }
  }
}

module.exports = { ensureDataDir }
