'use strict'
/**
 * data-init.cjs — 初始化 data/ 目录结构
 *
 * 首次启动时创建必要的运行时目录。
 * 部门和配置文件通过 UI 模板创建，不从 config/ 复制种子。
 * 幂等：已存在则跳过。
 */
const { existsSync, mkdirSync } = require('fs')
const {
  DATA_DIR, CONFIG_DIR, AGENTS_DIR, WORKSPACES_DIR,
  PROJECTS_DIR, STATE_DIR, DEPARTMENTS_DIR, LOGS_DIR,
} = require('./paths.cjs')

/**
 * 确保 data/ 目录结构存在。
 * 幂等操作：已存在的目录不会被重建。
 */
function ensureDataDir() {
  for (const dir of [DATA_DIR, CONFIG_DIR, AGENTS_DIR, WORKSPACES_DIR, PROJECTS_DIR, STATE_DIR, DEPARTMENTS_DIR, LOGS_DIR]) {
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  }
}

module.exports = { ensureDataDir }
