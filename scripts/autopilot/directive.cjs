/**
 * Directive — build CEO directives (supports strategy/coordination cycle types)
 */
const { readMission, readCeoWorkspaceFile, readProjectTasks, readStandaloneTasks, readAgentActivity, readAllDepartmentReports, readEscalations } = require('./readers.cjs')
const logger = require('./logger.cjs')

/**
 * Build a directive for the CEO agent.
 *
 * @param {number} cycleNum - Current cycle number
 * @param {string} cycleType - 'coordination' (default) | 'strategy'
 * @param {object} [memoryContext] - Optional structured memory context from memory.cjs
 * @returns {string} The full directive text
 */
function buildDirective(cycleNum, cycleType = 'coordination', memoryContext = null) {
  if (cycleType === 'strategy') {
    return buildStrategyDirective(cycleNum, memoryContext)
  }
  return buildCoordinationDirective(cycleNum, memoryContext)
}

function buildCoordinationDirective(cycleNum, memoryContext) {
  const mission = readMission()

  let context = `## 公司使命\n${mission}\n`

  // Memory section — use structured memory if available, fall back to raw file
  if (memoryContext) {
    if (memoryContext.summary) {
      context += `\n## 你的记忆摘要\n${memoryContext.summary}\n`
    }
    if (memoryContext.recentDecisions) {
      context += `\n## 近期重要决策\n${memoryContext.recentDecisions}\n`
    }
    if (memoryContext.departmentStatus) {
      context += `\n## 各部门最新状态\n${memoryContext.departmentStatus}\n`
    }
  } else {
    const memory = readCeoWorkspaceFile('MEMORY.md')
    if (memory) {
      context += `\n## 你的上次记忆 (MEMORY.md)\n${memory.slice(0, 4000)}\n`
    }
  }

  // Department reports (if available, prefer over raw agent data)
  const deptReports = readAllDepartmentReports()
  const hasDeptReports = Object.keys(deptReports).length > 0

  if (hasDeptReports) {
    context += `\n## 📊 部门报告\n`
    for (const [deptId, report] of Object.entries(deptReports)) {
      context += `\n### ${deptId} 部门\n${report.slice(0, 1000)}\n`
    }

    // Escalations
    const escalations = readEscalations()
    if (escalations.length > 0) {
      context += `\n## 🚨 需要CEO决策的升级事项\n`
      for (const esc of escalations) {
        context += `- [${esc.deptId}] ${esc.title || esc.description || JSON.stringify(esc)}\n`
      }
    }
  }

  // Always include real project data
  const projects = readProjectTasks()
  const agentActivity = readAgentActivity()

  if (projects.length > 0) {
    context += `\n## 📊 项目实时数据（来自系统，非记忆）\n`
    for (const proj of projects) {
      const tasks = proj.tasks || []
      const completed = tasks.filter(t => t.status === 'completed').length
      const running = tasks.filter(t => t.status === 'in_progress')
      const pending = tasks.filter(t => !['completed', 'in_progress', 'review', 'failed'].includes(t.status))

      context += `\n### ${proj.name} (${proj.id})\n`
      context += `- 状态: ${proj.status} | 阶段: ${proj.currentPhase}/${proj.totalPhases}\n`
      context += `- 进度: ${completed}/${tasks.length} 任务完成\n`

      if (running.length > 0) {
        context += `- ⚡ 进行中:\n`
        for (const t of running) {
          const agentInfo = agentActivity[t.assignedAgent]
          const idle = agentInfo ? `（${agentInfo.idleMins} 分钟前活跃）` : '（无活动记录）'
          context += `  - [${t.id}] ${t.name} → ${t.assignedAgent} ${idle} (${t.progress}%)\n`
        }
      }
      if (pending.length > 0) {
        context += `- 🔲 待办:\n`
        for (const t of pending) {
          context += `  - [${t.id}] ${t.name} → 分配给 ${t.assignedAgent}\n`
        }
      }

      if (completed > 0 && completed >= tasks.length - 1) {
        context += `- 🚨 **项目接近完成！仅剩 ${tasks.length - completed} 个任务。必须主动推进收尾。**\n`
      }
    }
  }

  // Standalone tasks
  const standaloneTasks = readStandaloneTasks()
  const activeStandalone = standaloneTasks.filter(t => t.status !== 'completed')
  if (activeStandalone.length > 0) {
    context += `\n## 📋 独立任务（用户通过任务面板分配）\n`
    for (const t of activeStandalone) {
      const agents = (t.assignees || []).join(', ') || '未分配'
      context += `- [${t.id}] ${t.name} → ${agents} (${t.status}, ${t.priority || 'P1'}, ${t.progress || 0}%)\n`
      if (t.description) context += `  描述: ${t.description}\n`
    }
  }

  // Agent availability (when no dept reports, show raw agent data)
  const agentNames = Object.keys(agentActivity)
  if (agentNames.length > 0) {
    context += `\n## 👥 团队活动状态\n`
    const sorted = agentNames.sort((a, b) => (agentActivity[a].idleMins || 0) - (agentActivity[b].idleMins || 0))
    for (const name of sorted) {
      const a = agentActivity[name]
      const status = a.idleMins < 5 ? '🔴 忙碌' : a.idleMins < 30 ? '🟡 刚完成' : '🟢 空闲'
      context += `- ${name}: ${status}（${a.idleMins}分钟无活动, 累计 ${a.totalTokens} tokens）\n`
    }
  }

  return `[Autopilot Cycle #${cycleNum}]

你是 CEO，这是公司第 ${cycleNum} 轮自主运营循环。

${context}

## 本轮任务

⚠️ **禁止"等待"。每轮必须产出至少一个具体动作。**

请按以下步骤执行：

1. **读取上方实时数据**：查看项目任务状态和团队活动（这是系统实时数据，比你的记忆更准确）
2. **找到阻塞点**：哪些任务在"进行中"但实际没有进展？哪些任务应该开始但没人做？
3. **立即行动**：通过 subagent 调用团队成员执行。不要等别人汇报。
   - 市场分析 → 调用 analyst
   - 产品规划 → 调用 product
   - 项目管理/开发协调 → 调用 pm
   - 营销推广 → 调用 marketing
4. **更新 MEMORY.md**：记录本轮做了什么、发现了什么问题、下轮关注什么
5. **更新 config/mission.md（仅在必要时）**：如果公司方向、项目状态、核心能力发生了实质变化，更新"当前状态"等相关章节。保持使命愿景稳定，只更新事实性内容

## 行动原则

1. **主动驱动，禁止被动等待** — 如果某个任务分配给了某人但没进展，你必须重新委派或亲自推动
2. **接近完成时加速** — 项目只剩 1-2 个任务时，要全力冲刺收尾，不能放慢
3. **检测僵局** — 如果同一个任务连续 2 轮没进展，换一种方式推进（换 agent、拆分任务、调整目标）
4. **闭环确认** — 委派任务后，检查上一轮委派的任务是否有产出。没有产出 = 没完成
5. **完成即汇报** — 如果项目所有任务已完成，明确声明"项目已完成"并更新状态
6. **空闲 agent 要利用** — 查看团队活动状态，如果有 agent 长时间空闲，给他们分配工作

## 自主解决问题（重要！）

遇到外部依赖阻塞时（如需要 API Key、数据库、云服务等），**先自己想替代方案**，不要等用户：

- 需要数据库 → 用 SQLite / JSON 文件，不等 Supabase
- 需要 AI API Key → 先用 mock 数据做 UI 联调，标注"接入真实 API 后替换"
- 需要支付 → 先用 mock Stripe，标注 test mode
- 需要部署 → 先确保 localhost 能跑，写好部署文档
- 需要域名 → 用 localhost 或 Vercel 免费域名

**只有真正无法自主解决的问题才上报给用户。** 上报格式必须写在 MEMORY.md 的 \`## 🚨 需要用户决策\` 区块，格式如下：

\`\`\`
## 🚨 需要用户决策
- [问题描述] — [为什么 agent 无法自行解决] — [建议方案]
\`\`\`

系统会自动把这个区块展示在前端 UI 上通知用户。`
}

function buildStrategyDirective(cycleNum, memoryContext) {
  const mission = readMission()
  const projects = readProjectTasks()
  const deptReports = readAllDepartmentReports()

  let context = `## 公司使命\n${mission}\n`

  if (memoryContext) {
    if (memoryContext.summary) {
      context += `\n## 你的记忆摘要\n${memoryContext.summary}\n`
    }
    if (memoryContext.lessonsLearned) {
      context += `\n## 经验总结\n${memoryContext.lessonsLearned}\n`
    }
  }

  // High-level project summary
  if (projects.length > 0) {
    context += `\n## 项目总览\n`
    for (const proj of projects) {
      const tasks = proj.tasks || []
      const completed = tasks.filter(t => t.status === 'completed').length
      context += `- ${proj.name}: ${proj.status} (${completed}/${tasks.length} tasks, phase ${proj.currentPhase}/${proj.totalPhases})\n`
    }
  }

  // Department summaries
  if (Object.keys(deptReports).length > 0) {
    context += `\n## 部门工作概要\n`
    for (const [deptId, report] of Object.entries(deptReports)) {
      context += `\n### ${deptId}\n${report.slice(0, 500)}\n`
    }
  }

  return `[Strategy Cycle #${cycleNum}]

你是 CEO，这是一次**战略规划循环**。不需要执行具体任务，而是做长期思考。

${context}

## 战略思考要求

1. **复盘**：过去一段时间的决策效果如何？有哪些成功经验和失败教训？
2. **方向判断**：当前项目方向是否正确？是否需要调整优先级？
3. **资源分配**：团队资源是否合理配置？是否有浪费或瓶颈？
4. **风险评估**：有哪些潜在风险需要提前准备？
5. **下阶段规划**：制定接下来的战略重点和里程碑

请将你的战略思考更新到 MEMORY.md 中。

如果战略方向有实质调整（如新增/砍掉业务线、核心能力变化、阶段转换），同步更新 \`config/mission.md\` 的相关章节（特别是"当前状态"和"运营模式"）。愿景和原则部分保持稳定，除非有根本性转变。`
}

module.exports = { buildDirective, buildCoordinationDirective, buildStrategyDirective }
