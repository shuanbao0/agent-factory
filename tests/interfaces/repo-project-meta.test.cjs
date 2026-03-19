'use strict'

const { describe, it, afterEach } = require('node:test')
const assert = require('node:assert/strict')
const { join } = require('path')
const { rmSync, existsSync, readFileSync } = require('fs')

const PROJECT_ROOT = join(__dirname, '..', '..')
const { ProjectMetaRepository } = require('../../core/repo/project-meta.cjs')

const ts = Date.now()
const testProjectId = `zzz-test-projmeta-${ts}`
const PROJECTS_DIR = join(PROJECT_ROOT, 'projects')

describe('ProjectMetaRepository', () => {
  let repo

  afterEach(() => {
    const testDir = join(PROJECTS_DIR, testProjectId)
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true })
    }
  })

  it('readMeta returns null for non-existent project', () => {
    repo = new ProjectMetaRepository()
    const result = repo.readMeta('zzz-nonexistent-proj-' + Date.now())
    assert.equal(result, null)
  })

  it('writeMeta + readMeta roundtrip', () => {
    repo = new ProjectMetaRepository()
    const meta = {
      name: 'Test Project',
      department: 'test-dept',
      status: 'active',
      tasks: [],
      createdAt: new Date().toISOString(),
    }
    repo.writeMeta(testProjectId, meta)
    const loaded = repo.readMeta(testProjectId)
    assert.ok(loaded)
    assert.equal(loaded.name, 'Test Project')
    assert.equal(loaded.department, 'test-dept')
    assert.equal(loaded.status, 'active')
    assert.ok(Array.isArray(loaded.tasks))
  })

  it('updateMeta applies mutator', () => {
    repo = new ProjectMetaRepository()
    repo.writeMeta(testProjectId, { name: 'Before', status: 'active', tasks: [] })
    const updated = repo.updateMeta(testProjectId, m => {
      m.name = 'After'
      m.status = 'completed'
      return m
    })
    assert.equal(updated.name, 'After')
    assert.equal(updated.status, 'completed')

    const loaded = repo.readMeta(testProjectId)
    assert.equal(loaded.name, 'After')
  })

  it('ensureProjectDirs creates subdirectories', () => {
    repo = new ProjectMetaRepository()
    repo.ensureProjectDirs(testProjectId, ['docs', 'output', 'drafts'])
    assert.ok(existsSync(join(PROJECTS_DIR, testProjectId, 'docs')))
    assert.ok(existsSync(join(PROJECTS_DIR, testProjectId, 'output')))
    assert.ok(existsSync(join(PROJECTS_DIR, testProjectId, 'drafts')))
  })

  it('writeProjectFile writes file to project dir', () => {
    repo = new ProjectMetaRepository()
    repo.writeProjectFile(testProjectId, 'README.md', '# Test Project\n')
    const content = readFileSync(join(PROJECTS_DIR, testProjectId, 'README.md'), 'utf-8')
    assert.equal(content, '# Test Project\n')
  })

  it('listProjectIds returns array of strings', () => {
    repo = new ProjectMetaRepository()
    const ids = repo.listProjectIds()
    assert.ok(Array.isArray(ids))
    for (const id of ids) {
      assert.equal(typeof id, 'string')
    }
  })

  it('readAll returns array of {projectId, meta}', () => {
    repo = new ProjectMetaRepository()
    // Create a test project so readAll has at least one entry
    repo.writeMeta(testProjectId, { name: 'ReadAll Test', tasks: [] })
    const all = repo.readAll()
    assert.ok(Array.isArray(all))
    const found = all.find(p => p.projectId === testProjectId)
    assert.ok(found, 'test project should appear in readAll results')
    assert.equal(found.meta.name, 'ReadAll Test')
  })
})
