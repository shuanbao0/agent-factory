'use strict'
/**
 * core/ — 总入口 barrel export
 *
 * 按子模块命名空间导出，避免命名冲突。
 */
module.exports = {
  repo: require('./repo/index.cjs'),
  task: require('./task/index.cjs'),
  llm: require('./llm/index.cjs'),
  observe: require('./observe/index.cjs'),
  agent: require('./agent/index.cjs'),
  common: require('./common/index.cjs'),
  autopilot: require('./autopilot/index.cjs'),
  db: require('./db/index.cjs'),
}
