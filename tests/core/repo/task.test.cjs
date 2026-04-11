'use strict'
const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const { mkdtempSync, writeFileSync, rmSync } = require('fs')
const { tmpdir } = require('os')
const { join } = require('path')

describe('TaskRepository', () => {
  it('exports TaskRepository and taskRepo', () => {
    const mod = require('../../../core/repo/task.cjs')
    assert.ok(mod.TaskRepository)
    assert.ok(mod.taskRepo)
    assert.ok(typeof mod.taskRepo.normalizeTask === 'function')
    assert.ok(typeof mod.taskRepo.readStandaloneTasks === 'function')
    assert.ok(typeof mod.taskRepo.readProjectsWithTasks === 'function')
    assert.ok(typeof mod.taskRepo.readProjectTasks === 'function')
    assert.ok(typeof mod.taskRepo.findAllTasks === 'function')
    assert.ok(typeof mod.taskRepo.findTaskById === 'function')
    assert.ok(typeof mod.taskRepo.updateProjectTask === 'function')
    assert.ok(typeof mod.taskRepo.deleteProjectTask === 'function')
    assert.ok(typeof mod.taskRepo.updateTaskInPlace === 'function')
  })

  it('normalizeTask handles legacy "running" status', () => {
    const { taskRepo } = require('../../../core/repo/task.cjs')
    const task = taskRepo.normalizeTask({ id: 't1', name: 'test', status: 'running' })
    assert.equal(task.status, 'in_progress')
  })

  it('normalizeTask defaults', () => {
    const { taskRepo } = require('../../../core/repo/task.cjs')
    const task = taskRepo.normalizeTask({ id: 't2', name: 'test' })
    assert.equal(task.status, 'pending')
    assert.equal(task.priority, 'P1')
    assert.equal(task.creator, 'user')
    assert.equal(task.progress, 0)
    assert.deepEqual(task.dependencies, [])
    assert.deepEqual(task.assignees, [])
  })

  it('normalizeTask extracts assignees from assignedAgent', () => {
    const { taskRepo } = require('../../../core/repo/task.cjs')
    const task = taskRepo.normalizeTask({ id: 't3', name: 'test', assignedAgent: 'writer-a' })
    assert.deepEqual(task.assignees, ['writer-a'])
    assert.equal(task.assignedAgent, 'writer-a')
  })

  describe('readTaskOutput', () => {
    const { taskRepo } = require('../../../core/repo/task.cjs')

    it('returns null for missing / empty output', () => {
      assert.equal(taskRepo.readTaskOutput(null), null)
      assert.equal(taskRepo.readTaskOutput({}), null)
      assert.equal(taskRepo.readTaskOutput({ output: '' }), null)
    })

    it('reads a single existing file path (absolute)', () => {
      const dir = mkdtempSync(join(tmpdir(), 'af-readoutput-'))
      try {
        const f = join(dir, 'a.md')
        writeFileSync(f, '# Hello')
        const content = taskRepo.readTaskOutput({ output: f })
        assert.equal(content, '# Hello')
      } finally {
        rmSync(dir, { recursive: true, force: true })
      }
    })

    it('reads comma-separated multi-path output (the bug that caused the rework death spiral)', () => {
      const dir = mkdtempSync(join(tmpdir(), 'af-readoutput-'))
      try {
        const a = join(dir, 'a.md')
        const b = join(dir, 'b.md')
        writeFileSync(a, 'Alpha content')
        writeFileSync(b, 'Beta content')
        const content = taskRepo.readTaskOutput({ output: `${a}, ${b}` })
        assert.ok(content, 'should return non-null')
        assert.match(content, /Alpha content/)
        assert.match(content, /Beta content/)
        assert.match(content, /---/, 'should separate files with divider')
      } finally {
        rmSync(dir, { recursive: true, force: true })
      }
    })

    it('accepts array of paths', () => {
      const dir = mkdtempSync(join(tmpdir(), 'af-readoutput-'))
      try {
        const a = join(dir, 'a.md')
        writeFileSync(a, 'content A')
        const content = taskRepo.readTaskOutput({ output: [a] })
        assert.match(content, /content A/)
      } finally {
        rmSync(dir, { recursive: true, force: true })
      }
    })

    it('skips non-existent paths but returns content from existing ones', () => {
      const dir = mkdtempSync(join(tmpdir(), 'af-readoutput-'))
      try {
        const a = join(dir, 'a.md')
        writeFileSync(a, 'real content')
        const content = taskRepo.readTaskOutput({ output: `${a}, ${dir}/missing.md` })
        assert.match(content, /real content/)
      } finally {
        rmSync(dir, { recursive: true, force: true })
      }
    })

    it('returns null when all paths are missing', () => {
      assert.equal(
        taskRepo.readTaskOutput({ output: '/nope/a.md, /nope/b.md' }),
        null
      )
    })

    it('treats non-path strings as inline content (legacy)', () => {
      const content = taskRepo.readTaskOutput({ output: 'PM Review 通过: commit abc — tests OK' })
      assert.equal(content, 'PM Review 通过: commit abc — tests OK')
    })
  })
})
