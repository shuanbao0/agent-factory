/**
 * Sync — project state synchronization (with phase regression fix)
 */
const { readFileSync, writeFileSync, existsSync, readdirSync } = require('fs')
const { join } = require('path')
const { PROJECTS_DIR, CEO_WORKSPACE, PROJECT_ROOT } = require('./constants.cjs')
const { readCeoWorkspaceFile, fetchSessionTokens } = require('./readers.cjs')
const logger = require('./logger.cjs')

/**
 * Sync project state from CEO response + filesystem data.
 *
 * Key fix: Phase regression — matches ALL phase mentions, takes the maximum,
 * and NEVER goes below the current phase.
 */
function syncProjects(ceoResponseText) {
  const memory = readCeoWorkspaceFile('MEMORY.md')

  try {
    if (!existsSync(PROJECTS_DIR)) return
    const dirs = readdirSync(PROJECTS_DIR, { withFileTypes: true })
      .filter(d => d.isDirectory())

    for (const dir of dirs) {
      const metaPath = join(PROJECTS_DIR, dir.name, '.project-meta.json')
      if (!existsSync(metaPath)) continue

      try {
        const meta = JSON.parse(readFileSync(metaPath, 'utf-8'))

        let phase = meta.currentPhase || 1
        let status = meta.status || 'planning'

        // Detect project status from actual task states (no text-based phase detection)
        if (meta.tasks) {
          const allDone = meta.tasks.length > 0 && meta.tasks.every(t => t.status === 'completed')
          const anyRunning = meta.tasks.some(t => t.status === 'in_progress')
          if (allDone) {
            status = 'completed'
            phase = meta.totalPhases || phase
            logger.info('sync', `Project ${dir.name} — all tasks completed!`)
          } else if (anyRunning) {
            status = 'in-progress'
          }
        }

        // Calculate tokens from gateway session files (real data)
        const sessionTokens = fetchSessionTokens()
        const assignedAgents = meta.assignedAgents || []
        let projectTokens = 0
        if (assignedAgents.length > 0) {
          for (const agentId of assignedAgents) {
            projectTokens += sessionTokens.byAgent[agentId] || 0
          }
        } else {
          projectTokens = sessionTokens.all
        }

        // Extract blockers from CEO memory
        const blockers = []
        if (memory) {
          const blockerMatch = memory.match(/## 🚨 需要用户决策\n([\s\S]*?)(?=\n## |\n$|$)/)
          if (blockerMatch) {
            const lines = blockerMatch[1].trim().split('\n')
            for (const line of lines) {
              const cleaned = line.replace(/^[-*]\s*/, '').trim()
              if (cleaned.length > 0) blockers.push(cleaned)
            }
          }
        }

        meta.currentPhase = phase
        meta.status = status
        meta.tokensUsed = projectTokens
        meta.blockers = blockers
        meta.updatedAt = new Date().toISOString()

        writeFileSync(metaPath, JSON.stringify(meta, null, 2) + '\n')
        logger.info('sync', `Synced project: ${dir.name} (phase ${phase}, ${status}, ${blockers.length} blockers)`)
      } catch (err) {
        logger.error('sync', `Failed to sync project ${dir.name}`, err)
      }
    }

    // Copy new docs from agent workspaces to project docs/
    const ceoDocsDir = join(CEO_WORKSPACE, 'docs')
    const pmDocsDir = join(PROJECT_ROOT, 'agents/pm/docs')
    for (const dir of dirs) {
      const projDocsDir = join(PROJECTS_DIR, dir.name, 'docs')
      if (!existsSync(projDocsDir)) continue
      for (const src of [ceoDocsDir, pmDocsDir]) {
        if (!existsSync(src)) continue
        try {
          const files = readdirSync(src)
          for (const f of files) {
            const srcFile = join(src, f)
            const destFile = join(projDocsDir, f)
            if (!existsSync(destFile) || readFileSync(srcFile, 'utf-8') !== readFileSync(destFile, 'utf-8')) {
              writeFileSync(destFile, readFileSync(srcFile, 'utf-8'))
            }
          }
        } catch (err) {
          logger.debug('sync', `Failed to copy docs from ${src}`, err)
        }
      }
    }
  } catch (err) {
    logger.error('sync', `Project sync error: ${err.message}`, err)
  }
}

module.exports = { syncProjects }
