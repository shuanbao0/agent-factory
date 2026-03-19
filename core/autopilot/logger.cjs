/**
 * Logger — structured logging to replace empty catch blocks
 *
 * Writes to config/autopilot-logs/YYYY-MM-DD.log
 * Levels: error | warn | info | debug
 */
const { existsSync, mkdirSync, appendFileSync, readdirSync, unlinkSync } = require('fs')
const { join } = require('path')
const { LOGS_DIR } = require('./constants.cjs')

const LOG_LEVELS = { error: 0, warn: 1, info: 2, debug: 3 }
let currentLevel = LOG_LEVELS.info

function setLogLevel(level) {
  if (LOG_LEVELS[level] !== undefined) currentLevel = LOG_LEVELS[level]
}

function ensureLogDir() {
  if (!existsSync(LOGS_DIR)) {
    mkdirSync(LOGS_DIR, { recursive: true })
  }
}

function getLogFile() {
  const date = new Date().toISOString().slice(0, 10) // YYYY-MM-DD
  return `${LOGS_DIR}/${date}.log`
}

function formatMessage(level, component, message, data) {
  const ts = new Date().toISOString()
  let line = `[${ts}] [${level.toUpperCase()}] [${component}] ${message}`
  if (data !== undefined) {
    const extra = data instanceof Error ? data.message : JSON.stringify(data)
    line += ` | ${extra}`
  }
  return line
}

function log(level, component, message, data) {
  if (LOG_LEVELS[level] === undefined || LOG_LEVELS[level] > currentLevel) return

  const line = formatMessage(level, component, message, data)

  // Console output
  if (level === 'error') console.error(line)
  else if (level === 'warn') console.warn(line)
  else console.log(line)

  // File output
  try {
    ensureLogDir()
    appendFileSync(getLogFile(), line + '\n')
  } catch (err) {
    // Last resort — can't log the logger failure infinitely
    console.error(`[LOGGER] Failed to write log file: ${err.message}`)
  }
}

function cleanOldLogs(maxDays = 14) {
  if (!existsSync(LOGS_DIR)) return
  const cutoff = Date.now() - maxDays * 86400_000
  try {
    for (const file of readdirSync(LOGS_DIR)) {
      const match = file.match(/^(\d{4}-\d{2}-\d{2})\.log$/)
      if (match && new Date(match[1]).getTime() < cutoff) {
        unlinkSync(join(LOGS_DIR, file))
      }
    }
  } catch { /* best effort */ }
}

// Clean old logs on module load (once per process)
cleanOldLogs()

module.exports = {
  setLogLevel,
  error: (component, message, data) => log('error', component, message, data),
  warn: (component, message, data) => log('warn', component, message, data),
  info: (component, message, data) => log('info', component, message, data),
  debug: (component, message, data) => log('debug', component, message, data),
}
