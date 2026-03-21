'use strict'

const { describe, it, afterEach } = require('node:test')
const assert = require('node:assert/strict')
const { join } = require('path')
const { rmSync, existsSync } = require('fs')

const { DEPARTMENTS_DIR } = require('../../core/common/paths.cjs')
const { MissionRepository } = require('../../core/repo/mission.cjs')

const ts = Date.now()
const testDeptId = `zzz-test-mission-${ts}`

describe('MissionRepository', () => {
  let repo

  afterEach(() => {
    const testDir = join(DEPARTMENTS_DIR, testDeptId)
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true })
    }
  })

  it('readMission returns string', () => {
    repo = new MissionRepository()
    const mission = repo.readMission()
    assert.equal(typeof mission, 'string')
    assert.ok(mission.length > 0)
  })

  it('readBaseMission returns string', () => {
    repo = new MissionRepository()
    const base = repo.readBaseMission()
    assert.equal(typeof base, 'string')
  })

  it('readDeptMission returns empty string for non-existent dept', () => {
    repo = new MissionRepository()
    const result = repo.readDeptMission('zzz-nonexistent-dept-' + Date.now())
    assert.equal(result, '')
  })

  it('writeDeptMission + readDeptMission roundtrip', () => {
    repo = new MissionRepository()
    const content = '# Test Department Mission\n\nDo great things.\n'
    repo.writeDeptMission(testDeptId, content)
    const loaded = repo.readDeptMission(testDeptId)
    assert.equal(loaded, content)
  })

  it('readAllDepartmentReports returns object', () => {
    repo = new MissionRepository()
    const reports = repo.readAllDepartmentReports()
    assert.equal(typeof reports, 'object')
    assert.ok(reports !== null)
    assert.ok(!Array.isArray(reports))
  })

  it('readDeptDirectives returns array for non-existent dept', () => {
    repo = new MissionRepository()
    const directives = repo.readDeptDirectives('zzz-nonexistent-' + Date.now())
    assert.ok(Array.isArray(directives))
    assert.equal(directives.length, 0)
  })

  it('writeDeptDirectives + readDeptDirectives roundtrip', () => {
    repo = new MissionRepository()
    const directives = [
      { type: 'priority', message: 'Focus on quality', issuedAt: new Date().toISOString() },
      { type: 'resource', message: 'Allocate more agents', issuedAt: new Date().toISOString() },
    ]
    repo.writeDeptDirectives(testDeptId, directives)
    const loaded = repo.readDeptDirectives(testDeptId)
    assert.ok(Array.isArray(loaded))
    assert.equal(loaded.length, 2)
    assert.equal(loaded[0].type, 'priority')
    assert.equal(loaded[1].message, 'Allocate more agents')
  })

  it('writeDeptReport + readDeptReport roundtrip', () => {
    repo = new MissionRepository()
    const report = '## Weekly Report\n\nAll tasks completed on time.\n'
    repo.writeDeptReport(testDeptId, report)
    const loaded = repo.readDeptReport(testDeptId)
    assert.equal(loaded, report)
  })

  it('readMemorySummary returns null for non-existent agent', () => {
    repo = new MissionRepository()
    const summary = repo.readMemorySummary('zzz-nonexistent-agent-' + Date.now())
    assert.equal(summary, null)
  })
})
