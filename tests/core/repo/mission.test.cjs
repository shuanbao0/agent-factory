'use strict'
const { describe, it } = require('node:test')
const assert = require('node:assert/strict')

describe('MissionRepository', () => {
  it('exports MissionRepository and missionRepo', () => {
    const mod = require('../../../core/repo/mission.cjs')
    assert.ok(mod.MissionRepository)
    assert.ok(mod.missionRepo)
    assert.ok(typeof mod.missionRepo.readMission === 'function')
    assert.ok(typeof mod.missionRepo.readBaseMission === 'function')
    assert.ok(typeof mod.missionRepo.readDeptMission === 'function')
    assert.ok(typeof mod.missionRepo.readAllDepartmentReports === 'function')
    assert.ok(typeof mod.missionRepo.readEscalations === 'function')
    assert.ok(typeof mod.missionRepo.readWorkspaceFile === 'function')
    assert.ok(typeof mod.missionRepo.readCeoWorkspaceFile === 'function')
    assert.ok(typeof mod.missionRepo.readMemorySummary === 'function')
  })
})
