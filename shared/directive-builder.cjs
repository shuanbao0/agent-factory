'use strict'

/**
 * DirectiveBuilder — chainable builder for constructing agent directives.
 *
 * Produces structured text prompts from composable sections.
 * Used by both CEO directives and department head directives.
 */
class DirectiveBuilder {
  constructor() {
    this._header = ''
    this._sections = []
  }

  /**
   * Set the directive header (first line, typically cycle info).
   * @param {string} header
   * @returns {DirectiveBuilder}
   */
  withHeader(header) {
    this._header = header
    return this
  }

  /**
   * Set role introduction line.
   * @param {string} agentId - Head agent ID
   * @param {string} deptName - Department display name
   * @returns {DirectiveBuilder}
   */
  withRole(agentId, deptName) {
    this._sections.push(`你是 ${agentId}，${deptName} 部门主管。`)
    return this
  }

  /**
   * Set CEO role introduction.
   * @param {number} cycleNum
   * @returns {DirectiveBuilder}
   */
  withCeoRole(cycleNum) {
    this._sections.push(`你是 CEO，这是公司第 ${cycleNum} 轮自主运营循环。`)
    return this
  }

  /**
   * Add memory context section.
   * @param {object|null} memoryContext - { summary?, recentDecisions?, departmentStatus?, lessonsLearned? }
   * @param {string} [fallbackMemory] - Raw memory text if structured not available
   * @returns {DirectiveBuilder}
   */
  withMemory(memoryContext, fallbackMemory) {
    if (memoryContext) {
      if (memoryContext.summary) {
        this._sections.push(`## 你的记忆摘要\n${memoryContext.summary}`)
      }
      if (memoryContext.recentDecisions) {
        this._sections.push(`## 近期重要决策\n${memoryContext.recentDecisions}`)
      }
      if (memoryContext.departmentStatus) {
        this._sections.push(`## 各部门最新状态\n${memoryContext.departmentStatus}`)
      }
      if (memoryContext.lessonsLearned) {
        this._sections.push(`## 经验总结\n${memoryContext.lessonsLearned}`)
      }
    } else if (fallbackMemory) {
      this._sections.push(`## 你的上次记忆 (MEMORY.md)\n${fallbackMemory.slice(0, 4000)}`)
    }
    return this
  }

  /**
   * Add department head memory (simpler format).
   * @param {string|null} memorySummary
   * @returns {DirectiveBuilder}
   */
  withDeptMemory(memorySummary) {
    if (memorySummary) {
      this._sections.push(`## 你的记忆\n${memorySummary}`)
    }
    return this
  }

  /**
   * Add mission section(s).
   * @param {string} [baseMission] - Global base mission
   * @param {string} [deptMission] - Department-specific mission
   * @returns {DirectiveBuilder}
   */
  withMission(baseMission, deptMission) {
    if (!baseMission && !deptMission) return this
    let section = '## 部门使命\n'
    if (baseMission) section += `### 通用准则\n${baseMission}\n\n`
    if (deptMission) section += `### 本部门使命\n${deptMission}`
    this._sections.push(section)
    return this
  }

  /**
   * Add full mission for CEO.
   * @param {string} mission
   * @returns {DirectiveBuilder}
   */
  withFullMission(mission) {
    this._sections.push(`## 公司使命\n${mission}`)
    return this
  }

  /**
   * Add CEO directives section.
   * @param {string} directives - Pre-formatted directives text
   * @returns {DirectiveBuilder}
   */
  withCeoDirectives(directives) {
    this._sections.push(`## CEO 指令\n${directives}`)
    return this
  }

  /**
   * Add budget info section.
   * @param {string} budgetInfo
   * @returns {DirectiveBuilder}
   */
  withBudget(budgetInfo) {
    this._sections.push(`## 部门预算\n${budgetInfo}`)
    return this
  }

  /**
   * Add task auto-transitions section.
   * @param {Array<{taskId, taskName, agentId, from, to, reason}>} transitions
   * @returns {DirectiveBuilder}
   */
  withTransitions(transitions) {
    if (!transitions || transitions.length === 0) return this

    const statusLabels = {
      review: '⏳ 待确认完成',
      completed: '✅ 已完成',
      failed: '❌ 已失败',
      in_progress: '🔄 进行中',
    }

    let section = '## ⚡ 本轮任务自动变化（系统检测）\n'
    section += '以下任务在本轮开始前被系统自动流转，请注意处理：\n'
    for (const t of transitions) {
      const label = statusLabels[t.to] || t.to
      section += `- [${t.taskId}] ${t.taskName} → ${t.agentId}: ${t.from} → ${label}（${t.reason}）\n`
    }

    const reviewTasks = transitions.filter(t => t.to === 'review')
    if (reviewTasks.length > 0) {
      section += `\n> 🔔 有 ${reviewTasks.length} 个任务等待你确认完成。请检查产出质量后在 [任务完成] 中确认，或通过 peer-send 要求 agent 继续完善。\n`
    }
    const failedTasks = transitions.filter(t => t.to === 'failed')
    if (failedTasks.length > 0) {
      section += `> ⚠️ 有 ${failedTasks.length} 个任务因长时间无进展被标记为失败。请决定是否重新分配。\n`
    }

    this._sections.push(section)
    return this
  }

  /**
   * Add team status section.
   * @param {string} teamStatus - Pre-formatted team status text
   * @returns {DirectiveBuilder}
   */
  withTeamStatus(teamStatus) {
    this._sections.push(`## 团队状态\n${teamStatus}`)
    return this
  }

  /**
   * Add department tasks section.
   * @param {string} deptTasks - Pre-formatted tasks text
   * @returns {DirectiveBuilder}
   */
  withTasks(deptTasks) {
    this._sections.push(`## 部门任务\n${deptTasks}`)
    return this
  }

  /**
   * Add KPI status section.
   * @param {string} kpiStatus - Pre-formatted KPI text
   * @returns {DirectiveBuilder}
   */
  withKpis(kpiStatus) {
    this._sections.push(`## 部门 KPI\n${kpiStatus}`)
    return this
  }

  /**
   * Add department reports section (for CEO).
   * @param {object} reports - { deptId: reportText }
   * @returns {DirectiveBuilder}
   */
  withDeptReports(reports) {
    if (!reports || Object.keys(reports).length === 0) return this
    let section = '## 📊 部门报告\n'
    for (const [deptId, report] of Object.entries(reports)) {
      section += `\n### ${deptId} 部门\n${report.slice(0, 1000)}\n`
    }
    this._sections.push(section)
    return this
  }

  /**
   * Add escalations section (for CEO).
   * @param {Array} escalations
   * @returns {DirectiveBuilder}
   */
  withEscalations(escalations) {
    if (!escalations || escalations.length === 0) return this
    let section = '## 🚨 需要CEO决策的升级事项\n'
    for (const esc of escalations) {
      section += `- [${esc.deptId}] ${esc.title || esc.description || JSON.stringify(esc)}\n`
    }
    this._sections.push(section)
    return this
  }

  /**
   * Add project data section (for CEO).
   * @param {string} projectData - Pre-formatted project data text
   * @returns {DirectiveBuilder}
   */
  withProjectData(projectData) {
    if (projectData) this._sections.push(projectData)
    return this
  }

  /**
   * Add standalone tasks section (for CEO).
   * @param {string} standaloneTasks - Pre-formatted standalone tasks text
   * @returns {DirectiveBuilder}
   */
  withStandaloneTasks(standaloneTasks) {
    if (standaloneTasks) this._sections.push(standaloneTasks)
    return this
  }

  /**
   * Add agent activity status section (for CEO).
   * @param {string} activityStatus - Pre-formatted activity text
   * @returns {DirectiveBuilder}
   */
  withAgentActivity(activityStatus) {
    if (activityStatus) this._sections.push(activityStatus)
    return this
  }

  /**
   * Add a raw text section.
   * @param {string} text
   * @returns {DirectiveBuilder}
   */
  withSection(text) {
    if (text) this._sections.push(text)
    return this
  }

  /**
   * Add action requirements section (text block).
   * @param {string} actionText
   * @returns {DirectiveBuilder}
   */
  withActionRequirements(actionText) {
    this._sections.push(actionText)
    return this
  }

  /**
   * Build the final directive string.
   * @returns {string}
   */
  build() {
    const parts = []
    if (this._header) parts.push(this._header)
    parts.push('')
    for (const section of this._sections) {
      parts.push(section)
      parts.push('')
    }
    return parts.join('\n').replace(/\n{3,}/g, '\n\n')
  }
}

module.exports = { DirectiveBuilder }
