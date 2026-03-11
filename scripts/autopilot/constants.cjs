/**
 * Constants — paths, timeouts, thresholds
 */
const { resolve, join } = require('path')

const PROJECT_ROOT = resolve(__dirname, '../..')
const CONFIG_DIR = join(PROJECT_ROOT, 'config')
const AGENTS_DIR = join(PROJECT_ROOT, 'agents')
const PROJECTS_DIR = join(PROJECT_ROOT, 'projects')
const SESSIONS_DIR = join(PROJECT_ROOT, '.openclaw-state', 'agents')
const WORKSPACES_DIR = join(PROJECT_ROOT, 'workspaces')

const MISSION_FILE = join(CONFIG_DIR, 'mission.md')
const BASE_MISSION_FILE = join(CONFIG_DIR, 'base-mission.md')
const STATE_FILE = join(CONFIG_DIR, 'autopilot-state.json')
const TASKS_FILE = join(CONFIG_DIR, 'tasks.json')
const DEPARTMENTS_FILE = join(CONFIG_DIR, 'departments.json')
const BUDGET_FILE = join(CONFIG_DIR, 'budget.json')
const GATEWAY_CONFIG_FILE = join(CONFIG_DIR, 'openclaw.json')

const DEPARTMENTS_DIR = join(CONFIG_DIR, 'departments')
const LOGS_DIR = join(CONFIG_DIR, 'autopilot-logs')

const CEO_WORKSPACE = join(AGENTS_DIR, 'ceo')

// Timeouts
const DEFAULT_AGENT_TIMEOUT_MS = 300000   // 5 minutes
const DEFAULT_INTERVAL_SEC = 1800          // 30 minutes
const CEO_COORDINATION_INTERVAL_SEC = 1800
const CEO_STRATEGY_INTERVAL_SEC = 86400
const DEFAULT_DEPT_INTERVAL_SEC = 600

// Limits
const MAX_HISTORY_ENTRIES = 50
const MAX_CYCLE_RESULT_LENGTH = 500
const MAX_HISTORY_RESULT_LENGTH = 300

// Session context management
const DEFAULT_CONTEXT_TOKENS = 200000        // Default context window
const COMPACT_TOKEN_RATIO = 0.6              // Compact at 60% of contextTokens
const RESET_COMPACT_COUNT = 10               // Reset session after 10 compactions
const RESET_TOKEN_RATIO = 0.8               // Reset if compact didn't bring tokens below 80%
const DEFAULT_COMPACT_TIMEOUT_MS = 30000     // Compact/kill timeout
const HEALTH_CHECK_INTERVAL = 3              // Health check every N cycles (was 5)
const MAX_DOMAIN_KNOWLEDGE_CHARS = 3000      // Max chars for domain knowledge file

// Session health thresholds
const SESSION_RESET_INPUT_TOKENS = 80000     // Reset session when inputTokens exceeds this
const SESSION_FORCE_COMPACT_TOKENS = 50000   // Force compact when inputTokens exceeds this

// Task auto-transition thresholds
const IDLE_COMPLETE_MINS = 10               // Agent idle N minutes → in_progress task auto-completed
const STALE_TASK_MINS = 30                  // Agent idle N minutes + low progress → task failed

// Chief response validation
const MIN_EFFECTIVE_RESPONSE_LENGTH = 50    // Below this char count = ineffective response
const MAX_CONSECUTIVE_FAILURES = 3           // Trigger fallback dispatch after N consecutive failures

module.exports = {
  PROJECT_ROOT,
  CONFIG_DIR,
  AGENTS_DIR,
  PROJECTS_DIR,
  SESSIONS_DIR,
  WORKSPACES_DIR,
  MISSION_FILE,
  BASE_MISSION_FILE,
  STATE_FILE,
  TASKS_FILE,
  DEPARTMENTS_FILE,
  BUDGET_FILE,
  GATEWAY_CONFIG_FILE,
  DEPARTMENTS_DIR,
  LOGS_DIR,
  CEO_WORKSPACE,
  DEFAULT_AGENT_TIMEOUT_MS,
  DEFAULT_INTERVAL_SEC,
  CEO_COORDINATION_INTERVAL_SEC,
  CEO_STRATEGY_INTERVAL_SEC,
  DEFAULT_DEPT_INTERVAL_SEC,
  MAX_HISTORY_ENTRIES,
  MAX_CYCLE_RESULT_LENGTH,
  MAX_HISTORY_RESULT_LENGTH,
  DEFAULT_CONTEXT_TOKENS,
  COMPACT_TOKEN_RATIO,
  RESET_COMPACT_COUNT,
  RESET_TOKEN_RATIO,
  DEFAULT_COMPACT_TIMEOUT_MS,
  HEALTH_CHECK_INTERVAL,
  MAX_DOMAIN_KNOWLEDGE_CHARS,
  SESSION_RESET_INPUT_TOKENS,
  SESSION_FORCE_COMPACT_TOKENS,
  IDLE_COMPLETE_MINS,
  STALE_TASK_MINS,
  MIN_EFFECTIVE_RESPONSE_LENGTH,
  MAX_CONSECUTIVE_FAILURES,
}
