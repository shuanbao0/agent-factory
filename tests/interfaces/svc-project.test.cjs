'use strict'

const { describe, it, afterEach } = require('node:test')
const assert = require('node:assert/strict')
const { join } = require('path')
const fs = require('fs')

const { createProject, listProjects } = require('../../core/common/project-service.cjs')

const PROJECT_ROOT = join(__dirname, '..', '..')
const PROJECTS_DIR = join(PROJECT_ROOT, 'projects')

const testIds = []

afterEach(() => {
  // Clean up test projects
  for (const id of testIds) {
    const dir = join(PROJECTS_DIR, id)
    if (fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  }
  testIds.length = 0
})

function makeTestId() {
  const id = `zzz-test-proj-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  testIds.push(id)
  return id
}

describe('ProjectService', () => {
  it('listProjects returns array', () => {
    const result = listProjects()
    assert.ok(Array.isArray(result))
  })

  it('createProject with valid data returns ok=true with project object', () => {
    const testId = makeTestId()
    const result = createProject(
      { name: testId, description: 'Test project', department: 'test-dept' },
      { phases: [{ labelEn: 'Phase 1', labelZh: '阶段1' }], directories: ['docs'] }
    )
    assert.equal(result.ok, true)
    assert.ok(result.project)
    assert.equal(result.project.name, testId)
    assert.equal(result.project.description, 'Test project')
  })

  it('createProject creates .project-meta.json', () => {
    const testId = makeTestId()
    createProject(
      { name: testId, description: 'Meta test' },
      { phases: [{ labelEn: 'P1', labelZh: '阶段1' }], directories: [] }
    )
    const metaPath = join(PROJECTS_DIR, testId, '.project-meta.json')
    assert.ok(fs.existsSync(metaPath), '.project-meta.json should exist')
  })

  it('createProject creates BRIEF.md', () => {
    const testId = makeTestId()
    createProject(
      { name: testId, description: 'Brief test' },
      { phases: [{ labelEn: 'P1', labelZh: '阶段1' }], directories: [] }
    )
    const briefPath = join(PROJECTS_DIR, testId, 'BRIEF.md')
    assert.ok(fs.existsSync(briefPath), 'BRIEF.md should exist')
    const content = fs.readFileSync(briefPath, 'utf8')
    assert.ok(content.includes(testId))
  })

  it('createProject creates subdirectories from workflow.directories', () => {
    const testId = makeTestId()
    createProject(
      { name: testId, description: 'Dirs test' },
      { phases: [{ labelEn: 'P1', labelZh: '阶段1' }], directories: ['docs', 'src', 'output'] }
    )
    for (const dir of ['docs', 'src', 'output']) {
      const dirPath = join(PROJECTS_DIR, testId, dir)
      assert.ok(fs.existsSync(dirPath), `${dir}/ should exist`)
    }
  })

  it('createProject with empty name returns error', () => {
    const result = createProject(
      { name: '', description: 'No name' },
      { phases: [], directories: [] }
    )
    assert.equal(result.ok, false)
    assert.ok(result.error)
  })

  it('createProject with duplicate name returns error', () => {
    const testId = makeTestId()
    const first = createProject(
      { name: testId, description: 'First' },
      { phases: [{ labelEn: 'P1', labelZh: '阶段1' }], directories: [] }
    )
    assert.equal(first.ok, true)

    const second = createProject(
      { name: testId, description: 'Duplicate' },
      { phases: [{ labelEn: 'P1', labelZh: '阶段1' }], directories: [] }
    )
    assert.equal(second.ok, false)
    assert.ok(second.error.includes('already exists'))
  })
})
