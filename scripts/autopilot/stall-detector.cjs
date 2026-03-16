/**
 * Stall Detector — 薄 Facade，委托 core/observe/stall-detector
 */
const coreStall = require('../../core/observe/stall-detector.cjs')

module.exports = {
  detectStalls: coreStall.detectStalls,
  detectDepartmentStall: coreStall.detectDepartmentStall,
}
