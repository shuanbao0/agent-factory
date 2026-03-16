// SYNC: keep in sync with ./cost.ts
'use strict'

const PRICING = {
  'claude-sonnet-4-6':   { input: 3.0,  output: 15.0 },
  'claude-opus-4-6':     { input: 15.0, output: 75.0 },
  'claude-haiku-4-5':    { input: 0.80, output: 4.0 },
  'claude-haiku-4-5-20251001': { input: 0.80, output: 4.0 },
  'MiniMax-M2.5':        { input: 0.0,  output: 0.0 },
  'MiniMax-M2.1':        { input: 0.0,  output: 0.0 },
}

module.exports = { PRICING }
