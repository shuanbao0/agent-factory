// SYNC: keep in sync with ./index.ts
'use strict'

module.exports = {
  ...require('./task.cjs'),
  ...require('./quality-gate.cjs'),
  ...require('./quality-validator.cjs'),
}
