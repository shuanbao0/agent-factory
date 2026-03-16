// SYNC: keep in sync with ./quality-validator.ts
'use strict'

const DEFAULT_GATE_CONFIG = {
  minScore: 75,
  requireSelfCheck: true,
  requirePeerReview: false,
  maxReworks: 3,
  validators: [],
  validatorConfig: {},
}

module.exports = { DEFAULT_GATE_CONFIG }
