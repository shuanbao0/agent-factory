/**
 * Constants — paths (delegated to paths.cjs), timeouts, thresholds
 */
const {
  PROJECT_ROOT, CONFIG_DIR, AGENTS_DIR, PROJECTS_DIR,
  SESSIONS_DIR, WORKSPACES_DIR,
  MISSION_FILE, BASE_MISSION_FILE, STATE_FILE, TASKS_FILE,
  DEPARTMENTS_FILE, BUDGET_FILE, GATEWAY_CONFIG_FILE,
  DEPARTMENTS_DIR, LOGS_DIR, CEO_WORKSPACE,
} = require('../common/paths.cjs')

// Timeouts
const DEFAULT_AGENT_TIMEOUT_MS = 600000   // 10 minutes
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
const IDLE_COMPLETE_MINS = 18               // Agent idle N minutes → in_progress task auto-completed (must exceed DEFAULT_DEPT_INTERVAL_SEC/60=10 + buffer)
const STALE_TASK_MINS = 30                  // Agent idle N minutes + low progress → task failed

// Chief response validation
const MIN_EFFECTIVE_RESPONSE_LENGTH = 50    // Below this char count = ineffective response
const MAX_CONSECUTIVE_FAILURES = 3           // Trigger fallback dispatch after N consecutive failures

// Dual-session mode (Chat + Worker)
const DUAL_SESSION_ENABLED = process.env.AF_DUAL_SESSION !== '0'  // on by default
const DUAL_SESSION_DEPTS = (process.env.AF_DUAL_SESSION_DEPTS || '').split(',').filter(Boolean)
const STATUS_QUERY_TIMEOUT_MS = 30000
const MAX_NO_RESPONSE_COUNT = 2
const MAX_TASK_MEMORIES = 5
const MEMORY_MAX_CHARS = 3000

/**
 * Check if dual-session mode is enabled for a department.
 * @param {string} deptId
 * @returns {boolean}
 */
function isDualSessionEnabled(deptId) {
  return DUAL_SESSION_ENABLED || DUAL_SESSION_DEPTS.includes(deptId)
}

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
  DUAL_SESSION_ENABLED,
  DUAL_SESSION_DEPTS,
  STATUS_QUERY_TIMEOUT_MS,
  MAX_NO_RESPONSE_COUNT,
  MAX_TASK_MEMORIES,
  MEMORY_MAX_CHARS,
  isDualSessionEnabled,
}
