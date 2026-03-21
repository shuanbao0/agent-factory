'use strict'
/**
 * paths.cjs — 所有数据目录和文件路径的单一真相源
 *
 * 全局唯一的路径定义模块。所有 core/、scripts/、UI 层文件
 * 应从此处导入路径常量，而非独立计算 PROJECT_ROOT。
 *
 * DATA_DIR 支持环境变量 AGENT_FACTORY_DATA_DIR 覆盖（容器化部署用）。
 */
const { resolve, join } = require('path')

// ── 根目录 ──────────────────────────────────────────────────────
const PROJECT_ROOT = resolve(__dirname, '..', '..')

// DATA_DIR: 所有运行时数据的根。
const DATA_DIR = process.env.AGENT_FACTORY_DATA_DIR || join(PROJECT_ROOT, 'data')

// ── 源码配置目录（git 跟踪，永不移动）───────────────────────────
const SOURCE_CONFIG_DIR = join(PROJECT_ROOT, 'config')

// ── 运行时配置目录 ──────────────────────────────────────────────
const CONFIG_DIR = join(DATA_DIR, 'config')

// ── 运行时数据目录 ──────────────────────────────────────────────
const AGENTS_DIR     = join(DATA_DIR, 'agents')
const WORKSPACES_DIR = join(DATA_DIR, 'workspaces')
const PROJECTS_DIR   = join(DATA_DIR, 'projects')
const STATE_DIR      = join(DATA_DIR, 'openclaw-state')
const SESSIONS_DIR   = join(STATE_DIR, 'agents')

// ── 模板目录 ────────────────────────────────────────────────────
const BUILTIN_AGENT_TEMPLATES_DIR = join(PROJECT_ROOT, 'templates', 'agents')  // 源码
const BUILTIN_DEPT_TEMPLATES_DIR  = join(PROJECT_ROOT, 'templates', 'departments')  // 源码
const CUSTOM_AGENT_TEMPLATES_DIR  = join(DATA_DIR, 'templates', 'agents', 'custom')  // 运行时
const CUSTOM_DEPT_TEMPLATES_DIR   = join(DATA_DIR, 'templates', 'departments', 'custom')  // 运行时
const SKILLS_DIR = join(PROJECT_ROOT, 'skills')

// ── 运行时数据目录（续）─────────────────────────────────────────
const DEPARTMENTS_DIR = join(DATA_DIR, 'departments')

// ── 日志目录（纯运行日志）────────────────────────────────────────
const LOGS_DIR = join(DATA_DIR, 'logs')

// ── 运行时配置 + 审计数据 ───────────────────────────────────────
const GATEWAY_CONFIG_FILE = join(CONFIG_DIR, 'openclaw.json')
const MODELS_FILE         = join(CONFIG_DIR, 'models.json')
const TASKS_FILE          = join(CONFIG_DIR, 'tasks.json')
const STATE_FILE          = join(CONFIG_DIR, 'autopilot-state.json')
const DEPARTMENTS_FILE    = join(CONFIG_DIR, 'departments.json')
const BUDGET_FILE         = join(CONFIG_DIR, 'budget.json')
const MISSION_FILE        = join(CONFIG_DIR, 'mission.md')
const COSTS_FILE          = join(CONFIG_DIR, 'autopilot-costs.jsonl')
const EVENTS_FILE         = join(CONFIG_DIR, 'autopilot-events.jsonl')
const SIGNAL_FILE         = join(CONFIG_DIR, '.autopilot-signal')

// ── 源码配置文件（种子/模板，git 跟踪）──────────────────────────
const BASE_RULES_FILE         = join(SOURCE_CONFIG_DIR, 'base-rules.md')
const PROJECT_STANDARDS_FILE  = join(SOURCE_CONFIG_DIR, 'project-standards.md')
const TASK_STANDARDS_FILE     = join(SOURCE_CONFIG_DIR, 'task-standards.md')
const PHASE_DELIVERABLES_FILE = join(SOURCE_CONFIG_DIR, 'phase-deliverables.md')
const BASE_MISSION_FILE       = join(SOURCE_CONFIG_DIR, 'base-mission.md')
const GATEWAY_DEFAULT_FILE    = join(SOURCE_CONFIG_DIR, 'openclaw.default.json')
const MODELS_DEFAULT_FILE     = join(SOURCE_CONFIG_DIR, 'models.default.json')

// ── .env（始终在项目根）─────────────────────────────────────────
const ENV_FILE = join(PROJECT_ROOT, '.env')

// ── 特殊路径 ────────────────────────────────────────────────────
const CEO_WORKSPACE = join(AGENTS_DIR, 'ceo')

module.exports = {
  PROJECT_ROOT, DATA_DIR,
  SOURCE_CONFIG_DIR, CONFIG_DIR,
  AGENTS_DIR, WORKSPACES_DIR, PROJECTS_DIR,
  STATE_DIR, SESSIONS_DIR,
  BUILTIN_AGENT_TEMPLATES_DIR, BUILTIN_DEPT_TEMPLATES_DIR,
  CUSTOM_AGENT_TEMPLATES_DIR, CUSTOM_DEPT_TEMPLATES_DIR, SKILLS_DIR,
  GATEWAY_CONFIG_FILE, MODELS_FILE, TASKS_FILE, STATE_FILE,
  DEPARTMENTS_FILE, BUDGET_FILE, DEPARTMENTS_DIR,
  COSTS_FILE, EVENTS_FILE, LOGS_DIR, MISSION_FILE, SIGNAL_FILE,
  BASE_RULES_FILE, PROJECT_STANDARDS_FILE, TASK_STANDARDS_FILE,
  PHASE_DELIVERABLES_FILE, BASE_MISSION_FILE,
  GATEWAY_DEFAULT_FILE, MODELS_DEFAULT_FILE,
  ENV_FILE, CEO_WORKSPACE,
}
