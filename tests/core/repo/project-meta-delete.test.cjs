'use strict'
const { describe, it, beforeEach, afterEach } = require('node:test')
const assert = require('node:assert/strict')
const { mkdirSync, existsSync, writeFileSync, rmSync } = require('fs')
const { join } = require('path')

const PROJECT_ROOT = join(__dirname, '..', '..', '..')
const PROJECTS_DIR = join(PROJECT_ROOT, 'projects')

describe('ProjectMetaRepository.deleteProject', () => {
  const TEST_PROJECT = '__test_delete_project__'
  const testDir = join(PROJECTS_DIR, TEST_PROJECT)

  beforeEach(() => {
    mkdirSync(testDir, { recursive: true })
    writeFileSync(join(testDir, '.project-meta.json'), JSON.stringify({ name: 'test' }))
  })

  afterEach(() => {
    if (existsSync(testDir)) rmSync(testDir, { recursive: true, force: true })
  })

  it('deletes project directory', () => {
    const { projectMetaRepo } = require('../../../core/repo/project-meta.cjs')
    projectMetaRepo.deleteProject(TEST_PROJECT)
    assert.ok(!existsSync(testDir))
  })

  it('throws on path traversal', () => {
    const { projectMetaRepo } = require('../../../core/repo/project-meta.cjs')
    assert.throws(() => projectMetaRepo.deleteProject('../config'), /invalid project id/)
  })

  it('throws on nonexistent project', () => {
    const { projectMetaRepo } = require('../../../core/repo/project-meta.cjs')
    assert.throws(() => projectMetaRepo.deleteProject('__nonexistent_proj_xyz__'), /not found/)
  })

  it('rejects empty id', () => {
    const { projectMetaRepo } = require('../../../core/repo/project-meta.cjs')
    assert.throws(() => projectMetaRepo.deleteProject(''), /invalid project id/)
  })
})
