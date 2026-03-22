'use strict'
const { describe, it, afterEach } = require('node:test')
const assert = require('node:assert/strict')
const { existsSync, readFileSync, rmSync, readdirSync } = require('fs')
const { join } = require('path')
const { PROJECTS_DIR } = require('../../core/common/paths.cjs')
const { createProject, listProjects } = require('../../core/common/project-service.cjs')

const TEST_SLUG = 'zzz-test-proj-' + process.pid
const TEST_DEPT = 'zzz-test-dept'
const TEST_ID = `${TEST_DEPT}/${TEST_SLUG}`

afterEach(() => {
  // Clean up any test project directories (both top-level and nested dept/slug)
  if (existsSync(PROJECTS_DIR)) {
    try {
      for (const name of readdirSync(PROJECTS_DIR)) {
        const fullPath = join(PROJECTS_DIR, name)
        if (name.startsWith('zzz-test-')) {
          rmSync(fullPath, { recursive: true, force: true })
        }
      }
    } catch { /* ignore */ }
  }
})

describe('Project lifecycle — create + list', () => {
  it('create project + verify structure', () => {
    const workflow = {
      phases: [
        { labelEn: 'Planning', labelZh: '规划' },
        { labelEn: 'Execution', labelZh: '执行' },
      ],
      directories: ['docs', 'src'],
    }

    const result = createProject(
      { name: TEST_SLUG, description: 'Test Project', department: TEST_DEPT },
      workflow
    )

    assert.equal(result.ok, true)
    assert.ok(result.project)
    assert.equal(result.project.id, TEST_ID)
    assert.equal(result.project.name, TEST_SLUG)
    assert.equal(result.project.description, 'Test Project')
    assert.equal(result.project.department, TEST_DEPT)
    assert.equal(result.project.totalPhases, 2)
    assert.equal(result.project.status, 'planning')

    // Verify .project-meta.json exists
    const metaPath = join(PROJECTS_DIR, TEST_ID, '.project-meta.json')
    assert.ok(existsSync(metaPath), '.project-meta.json should exist')

    const meta = JSON.parse(readFileSync(metaPath, 'utf-8'))
    assert.equal(meta.name, TEST_SLUG)
    assert.equal(meta.description, 'Test Project')
    assert.ok(meta.createdAt)
    assert.deepEqual(meta.tasks, [])
    assert.deepEqual(meta.assignedAgents, [])

    // Verify BRIEF.md created
    const briefPath = join(PROJECTS_DIR, TEST_ID, 'BRIEF.md')
    assert.ok(existsSync(briefPath), 'BRIEF.md should exist')
    const brief = readFileSync(briefPath, 'utf-8')
    assert.ok(brief.includes(TEST_ID))
    assert.ok(brief.includes('Planning'))
    assert.ok(brief.includes('Execution'))

    // Verify subdirectories created
    assert.ok(existsSync(join(PROJECTS_DIR, TEST_ID, 'docs')), 'docs/ should exist')
    assert.ok(existsSync(join(PROJECTS_DIR, TEST_ID, 'src')), 'src/ should exist')
  })

  it('create fails: empty name', () => {
    const result = createProject(
      { name: '', description: 'Bad' },
      { phases: [], directories: [] }
    )
    assert.equal(result.ok, false)
    assert.equal(result.status, 400)
  })

  it('listProjects includes newly created project', () => {
    const workflow = {
      phases: [{ labelEn: 'Phase1', labelZh: '阶段1' }],
      directories: ['docs'],
    }

    createProject(
      { name: TEST_SLUG, description: 'List Test', department: TEST_DEPT },
      workflow
    )

    const projects = listProjects()
    const found = projects.find(p => p.id === TEST_ID)
    assert.ok(found, 'newly created project should appear in list')
    assert.equal(found.name, TEST_SLUG)
  })
})
