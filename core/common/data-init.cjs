'use strict'
/**
 * data-init.cjs — 初始化 data/ 目录结构
 *
 * 首次启动时创建必要的运行时目录和种子文件。
 * 幂等：已存在则跳过。
 */
const { existsSync, mkdirSync, copyFileSync } = require('fs')
const {
  DATA_DIR, CONFIG_DIR, AGENTS_DIR, WORKSPACES_DIR,
  PROJECTS_DIR, STATE_DIR, DEPARTMENTS_DIR, LOGS_DIR,
  CUSTOM_AGENT_TEMPLATES_DIR, CUSTOM_DEPT_TEMPLATES_DIR,
  MISSION_FILE, MISSION_DEFAULT_FILE,
} = require('./paths.cjs')

/**
 * 确保 data/ 目录结构存在，并复制种子文件。
 * 幂等操作：已存在的目录和文件不会被覆盖。
 */
function ensureDataDir() {
  for (const dir of [
    DATA_DIR, CONFIG_DIR, AGENTS_DIR, WORKSPACES_DIR,
    PROJECTS_DIR, STATE_DIR, DEPARTMENTS_DIR, LOGS_DIR,
    CUSTOM_AGENT_TEMPLATES_DIR, CUSTOM_DEPT_TEMPLATES_DIR,
  ]) {
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  }

  // Seed company mission from config/mission.default.md if not yet present
  if (!existsSync(MISSION_FILE) && existsSync(MISSION_DEFAULT_FILE)) {
    copyFileSync(MISSION_DEFAULT_FILE, MISSION_FILE)
  }
}

module.exports = { ensureDataDir }
