/**
 * Quality Gate — 薄 Facade，委托 core/task/quality-orchestrator
 *
 * QualityOrchestrator 需要 sendFn 注入（DI），这里注入 gateway.sendToAgent。
 */
const { QualityOrchestrator } = require('../../core/task/quality-orchestrator.cjs')
const { sendToAgent } = require('./gateway.cjs')

const orch = new QualityOrchestrator({ sendFn: sendToAgent })

module.exports = {
  processQualityGate: (deptId, task) => orch.process(deptId, task),
  selectReviewer: (deptId, task, config) => orch.selectReviewer(deptId, task, config),
  findTasksInReview: (deptId, projects) => orch.findTasksInReview(deptId, projects),
}
