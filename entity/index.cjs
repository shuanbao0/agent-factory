// SYNC: keep in sync with ./index.ts (excluding ui/ which has no .cjs)
'use strict'

module.exports = {
  ...require('./task/index.cjs'),
  ...require('./agent/index.cjs'),
  ...require('./dept/index.cjs'),
  ...require('./config/index.cjs'),
  ...require('./autopilot/index.cjs'),
  ...require('./observe/index.cjs'),
  ...require('./project/index.cjs'),
}
