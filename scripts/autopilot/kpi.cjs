/**
 * KPI — 薄 Facade，委托 core/observe/kpi
 */
const coreKpi = require('../../core/observe/kpi.cjs')

module.exports = {
  calculateDepartmentKPIs: coreKpi.calculateDepartmentKPIs,
  saveKPISnapshot: coreKpi.saveKPISnapshot,
  readKPIHistory: coreKpi.readKPIHistory,
  getCompanyKPIs: coreKpi.getCompanyKPIs,
}
