'use strict'
/**
 * core/autopilot/ — barrel export
 *
 * Aggregates all autopilot sub-modules into a single namespace.
 */
module.exports = {
  ...require('./orchestrator.cjs'),
  ...require('./department-loop.cjs'),
  ...require('./gateway-client.cjs'),
  ...require('./directive.cjs'),
  ...require('./dept-directive.cjs'),
  ...require('./sync.cjs'),
  ...require('./dept-activity.cjs'),
  ...require('./task-prompt.cjs'),
  constants: require('./constants.cjs'),
  logger: require('../common/logger.cjs'),
}
