'use strict'
/**
 * DirectiveBuilder — 链式指令文本构建器
 *
 * 设计模式：Builder
 *
 * 职责：
 * - 通过链式调用组装多段结构化指令文本
 * - 支持 header、角色、记忆、使命、团队状态、任务列表、预算、KPI 等段落
 * - 最终 build() 输出格式良好的 Markdown 文本，传给 LLM
 *
 * 使用方式：
 *   const directive = new DirectiveBuilder()
 *     .withHeader('# 第 42 轮循环')
 *     .withRole('novel-chief', '创作部')
 *     .withMemory(memoryContext)
 *     .withTasks(tasksText)
 *     .build()
 *
 * 同时用于部门主管指令和 CEO 指令的构建
 */
class DirectiveBuilder {
  constructor() {
    this._header = ''       // 指令头部（通常是循环编号）
    this._sections = []     // 各段落内容
  }

  /**
   * 设置指令头部（第一行，通常包含循环信息）
   * @param {string} header
   * @returns {DirectiveBuilder}
   */
  withHeader(header) {
    this._header = header
    return this
  }

  /**
   * 设置部门主管角色介绍
   * @param {string} agentId - 主管 Agent ID
   * @param {string} deptName - 部门显示名
   * @returns {DirectiveBuilder}
   */
  withRole(agentId, deptName) {
    this._sections.push(`你是 ${agentId}，${deptName} 部门主管。`)
    return this
  }

  /**
   * 设置 CEO 角色介绍
   * @param {number} cycleNum - 循环编号
   * @returns {DirectiveBuilder}
   */
  withCeoRole(cycleNum) {
    this._sections.push(`你是 CEO，这是公司第 ${cycleNum} 轮自主运营循环。`)
    return this
  }

  /**
   * 添加 CEO 记忆上下文（结构化格式）
   *
   * 支持字段：summary, recentDecisions, departmentStatus, lessonsLearned
   * 如果没有结构化数据，可传 fallbackMemory（原始文本截断到 4000 字符）
   *
   * @param {object|null} memoryContext - 结构化记忆
   * @param {string} [fallbackMemory] - 兜底原始记忆文本
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
   * 添加部门主管记忆（简化格式）
   * @param {string|null} memorySummary - 记忆摘要文本
   * @returns {DirectiveBuilder}
   */
  withDeptMemory(memorySummary) {
    if (memorySummary) {
      this._sections.push(`## 你的记忆\n${memorySummary}`)
    }
    return this
  }

  /**
   * 添加使命段落
   * @param {string} [baseMission] - 全局通用准则
   * @param {string} [deptMission] - 部门专属使命
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
   * 添加 CEO 级公司使命
   * @param {string} mission - 使命文本
   * @returns {DirectiveBuilder}
   */
  withFullMission(mission) {
    this._sections.push(`## 公司使命\n${mission}`)
    return this
  }

  /**
   * 添加 CEO 指令段落
   * @param {string} directives - 预格式化的指令文本
   * @returns {DirectiveBuilder}
   */
  withCeoDirectives(directives) {
    this._sections.push(`## CEO 指令\n${directives}`)
    return this
  }

  /**
   * 添加预算信息段落
   * @param {string} budgetInfo - 预算信息文本
   * @returns {DirectiveBuilder}
   */
  withBudget(budgetInfo) {
    this._sections.push(`## 部门预算\n${budgetInfo}`)
    return this
  }

  /**
   * 添加任务自动变化段落（系统检测的状态转换）
   *
   * 包含 review 待确认提示和 failed 告警
   *
   * @param {Array<{taskId, taskName, agentId, from, to, reason}>} transitions - 本轮变化列表
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

    // 待确认完成提示
    const reviewTasks = transitions.filter(t => t.to === 'review')
    if (reviewTasks.length > 0) {
      section += `\n> 🔔 有 ${reviewTasks.length} 个任务等待你确认完成。请检查产出质量后在 [任务完成] 中确认，或通过 peer-send 要求 agent 继续完善。\n`
    }
    // 失败告警
    const failedTasks = transitions.filter(t => t.to === 'failed')
    if (failedTasks.length > 0) {
      section += `> ⚠️ 有 ${failedTasks.length} 个任务因长时间无进展被标记为失败。请决定是否重新分配。\n`
    }

    this._sections.push(section)
    return this
  }

  /**
   * 添加团队状态段落
   * @param {string} teamStatus - 预格式化的团队状态文本
   * @returns {DirectiveBuilder}
   */
  withTeamStatus(teamStatus) {
    this._sections.push(`## 团队状态\n${teamStatus}`)
    return this
  }

  /**
   * 添加部门任务段落
   * @param {string} deptTasks - 预格式化的任务列表文本
   * @returns {DirectiveBuilder}
   */
  withTasks(deptTasks) {
    this._sections.push(`## 部门任务\n${deptTasks}`)
    return this
  }

  /**
   * 添加 KPI 段落
   * @param {string} kpiStatus - 预格式化的 KPI 文本
   * @returns {DirectiveBuilder}
   */
  withKpis(kpiStatus) {
    this._sections.push(`## 部门 KPI\n${kpiStatus}`)
    return this
  }

  /**
   * 添加部门报告段落（CEO 视图）
   * @param {object} reports - { deptId: reportText } 部门报告映射
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
   * 添加升级事项段落（需要 CEO 决策的问题）
   * @param {Array} escalations - 升级事项列表
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
   * 添加项目数据段落（CEO 视图）
   * @param {string} projectData - 预格式化的项目数据文本
   * @returns {DirectiveBuilder}
   */
  withProjectData(projectData) {
    if (projectData) this._sections.push(projectData)
    return this
  }

  /**
   * 添加独立任务段落（CEO 视图）
   * @param {string} standaloneTasks - 预格式化文本
   * @returns {DirectiveBuilder}
   */
  withStandaloneTasks(standaloneTasks) {
    if (standaloneTasks) this._sections.push(standaloneTasks)
    return this
  }

  /**
   * 添加 Agent 活跃状态段落（CEO 视图）
   * @param {string} activityStatus - 预格式化文本
   * @returns {DirectiveBuilder}
   */
  withAgentActivity(activityStatus) {
    if (activityStatus) this._sections.push(activityStatus)
    return this
  }

  /**
   * 添加原始文本段落（通用）
   * @param {string} text - 任意文本
   * @returns {DirectiveBuilder}
   */
  withSection(text) {
    if (text) this._sections.push(text)
    return this
  }

  /**
   * 添加操作要求段落
   * @param {string} actionText - 操作要求文本
   * @returns {DirectiveBuilder}
   */
  withActionRequirements(actionText) {
    this._sections.push(actionText)
    return this
  }

  /**
   * 构建最终指令文本
   *
   * 将 header + 所有段落用空行连接，并清理多余空行（3 行以上合并为 2 行）
   *
   * @returns {string} 格式良好的 Markdown 指令文本
   */
  build() {
    const parts = []
    if (this._header) parts.push(this._header)
    parts.push('')
    for (const section of this._sections) {
      parts.push(section)
      parts.push('')
    }
    // 清理多余空行
    return parts.join('\n').replace(/\n{3,}/g, '\n\n')
  }
}

module.exports = { DirectiveBuilder }
