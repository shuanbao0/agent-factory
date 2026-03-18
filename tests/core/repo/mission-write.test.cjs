'use strict'
const { describe, it, beforeEach, afterEach } = require('node:test')
const assert = require('node:assert/strict')
const { mkdirSync, existsSync, readFileSync, rmSync, writeFileSync } = require('fs')
const { join } = require('path')

const PROJECT_ROOT = join(__dirname, '..', '..', '..')
const CONFIG_DIR = join(PROJECT_ROOT, 'config')
const MISSION_FILE = join(CONFIG_DIR, 'mission.md')
const BASE_MISSION_FILE = join(CONFIG_DIR, 'base-mission.md')
const DEPARTMENTS_DIR = join(CONFIG_DIR, 'departments')

describe('MissionRepository write methods', () => {
  let missionBackup = null
  let baseMissionBackup = null
  const TEST_DEPT = '__test_write_dept__'
  const testDeptDir = join(DEPARTMENTS_DIR, TEST_DEPT)

  beforeEach(() => {
    if (existsSync(MISSION_FILE)) missionBackup = readFileSync(MISSION_FILE, 'utf-8')
    if (existsSync(BASE_MISSION_FILE)) baseMissionBackup = readFileSync(BASE_MISSION_FILE, 'utf-8')
  })

  afterEach(() => {
    if (missionBackup !== null) writeFileSync(MISSION_FILE, missionBackup)
    else if (existsSync(MISSION_FILE)) rmSync(MISSION_FILE)

    if (baseMissionBackup !== null) writeFileSync(BASE_MISSION_FILE, baseMissionBackup)
    else if (existsSync(BASE_MISSION_FILE)) rmSync(BASE_MISSION_FILE)

    if (existsSync(testDeptDir)) rmSync(testDeptDir, { recursive: true, force: true })
  })

  it('writeMission writes content atomically', () => {
    const { missionRepo } = require('../../../core/repo/mission.cjs')
    missionRepo.writeMission('# Test Mission\nHello world')
    const content = readFileSync(MISSION_FILE, 'utf-8')
    assert.equal(content, '# Test Mission\nHello world')
  })

  it('writeBaseMission writes content atomically', () => {
    const { missionRepo } = require('../../../core/repo/mission.cjs')
    missionRepo.writeBaseMission('# Base Mission\nTest content')
    const content = readFileSync(BASE_MISSION_FILE, 'utf-8')
    assert.equal(content, '# Base Mission\nTest content')
  })

  it('writeDeptMission creates directory if needed', () => {
    const { missionRepo } = require('../../../core/repo/mission.cjs')
    missionRepo.writeDeptMission(TEST_DEPT, '# Dept Mission')
    const content = readFileSync(join(testDeptDir, 'mission.md'), 'utf-8')
    assert.equal(content, '# Dept Mission')
  })

  it('writeMission is idempotent', () => {
    const { missionRepo } = require('../../../core/repo/mission.cjs')
    missionRepo.writeMission('content-1')
    missionRepo.writeMission('content-2')
    const content = readFileSync(MISSION_FILE, 'utf-8')
    assert.equal(content, 'content-2')
  })
})
