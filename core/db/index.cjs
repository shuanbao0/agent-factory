'use strict'
/**
 * core/db/ — 数据库层 barrel export
 */
module.exports = {
  ...require('./connection.cjs'),
  ...require('./migrations.cjs'),
  costQueries: require('./queries/cost-queries.cjs'),
  taskQueries: require('./queries/task-queries.cjs'),
  eventQueries: require('./queries/event-queries.cjs'),
  deptQueries: require('./queries/dept-queries.cjs'),
  messageQueries: require('./queries/message-queries.cjs'),
  agentQueries: require('./queries/agent-queries.cjs'),
  projectQueries: require('./queries/project-queries.cjs'),
  deptConfigQueries: require('./queries/dept-config-queries.cjs'),
}
