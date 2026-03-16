/**
 * Memory — 薄 Facade，委托 core/agent/memory
 */
const coreMemory = require('../../core/agent/memory.cjs')

module.exports = {
  buildMemoryContext: coreMemory.buildMemoryContext,
  compressMemory: coreMemory.compressMemory,
  compressMemoryByRole: coreMemory.compressMemoryByRole,
  extractSummaryFromMemory: coreMemory.extractSummaryFromMemory,
}
