/**
 * Sync — project state synchronization (with phase regression fix)
 */
const { existsSync } = require('fs')
const { join } = require('path')
const { PROJECTS_DIR, CEO_WORKSPACE, PROJECT_ROOT } = require('./constants.cjs')
const { missionRepo } = require('../repo/mission.cjs')
const { sessionRepo } = require('../repo/session.cjs')
const { projectMetaRepo } = require('../repo/project-meta.cjs')
const { agentMetaRepo } = require('../repo/agent-meta.cjs')
const fileBrowser = require('../common/file-browser.cjs')
const logger = require('./logger.cjs')

/**
 * Sync project state from CEO response + filesystem data.
 *
 * Key fix: Phase regression — matches ALL phase mentions, takes the maximum,
 * and NEVER goes below the current phase.
 */
function syncProjects(ceoResponseText) {
  const memory = missionRepo.readCeoWorkspaceFile('MEMORY.md')

  try {
    const projectIds = projectMetaRepo.listProjectIds()

    for (const dirName of projectIds) {
      try {
        const meta = projectMetaRepo.readMeta(dirName)
        if (!meta) continue

        let phase = meta.currentPhase || 1
        let status = meta.status || 'planning'

        // Detect project status from actual task states (no text-based phase detection)
        if (meta.tasks) {
          const allDone = meta.tasks.length > 0 && meta.tasks.every(t => t.status === 'completed')
          const anyRunning = meta.tasks.some(t => t.status === 'in_progress')
          if (allDone) {
            status = 'completed'
            phase = meta.totalPhases || phase
            logger.info('sync', `Project ${dirName} — all tasks completed!`)
          } else if (anyRunning) {
            status = 'in-progress'
          }
        }

        // Calculate tokens from gateway session files (real data)
        const sessionTokens = sessionRepo.fetchSessionTokens()
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

        projectMetaRepo.writeMeta(dirName, meta)
        logger.info('sync', `Synced project: ${dirName} (phase ${phase}, ${status}, ${blockers.length} blockers)`)
      } catch (err) {
        logger.error('sync', `Failed to sync project ${dirName}`, err)
      }
    }

    // Copy new docs from agent workspaces to project docs/
    const ceoDocsDir = join(CEO_WORKSPACE, 'docs')
    const pmDocsDir = join(PROJECT_ROOT, 'agents/pm/docs')
    for (const dirName of projectIds) {
      const projDocsDir = join(PROJECTS_DIR, dirName, 'docs')
      if (!existsSync(projDocsDir)) continue
      for (const src of [ceoDocsDir, pmDocsDir]) {
        if (!existsSync(src)) continue
        try {
          const agentId = src.includes('/ceo/') ? 'ceo' : 'pm'
          const entries = agentMetaRepo.listAgentDir(agentId, 'docs')
          const files = entries.filter(e => e.isFile).map(e => e.name)
          for (const f of files) {
            const srcResult = fileBrowser.getFileContent(src, f)
            if (srcResult.error) continue
            const destResult = fileBrowser.getFileContent(projDocsDir, f)
            if (destResult.error || srcResult.content !== destResult.content) {
              projectMetaRepo.writeProjectFile(dirName, `docs/${f}`, srcResult.content)
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
