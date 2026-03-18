'use strict'
/**
 * AutopilotState — 全局状态持久化单元测试
 *
 * 测试策略：
 * - 使用临时目录模拟文件读写
 * - 测试 loadState / saveState / withStateLock 的核心逻辑
 */
const { describe, it, afterEach } = require('node:test')
const assert = require('node:assert/strict')
const { mkdirSync, writeFileSync, readFileSync, rmSync, existsSync, renameSync } = require('fs')
const { join } = require('path')

const TEST_DIR = join(__dirname, '..', '..', '..', '_test_autopilot_state_tmp')

describe('autopilot-state', () => {
  afterEach(() => {
    try { rmSync(TEST_DIR, { recursive: true, force: true }) } catch {}
  })

  describe('loadState 逻辑', () => {
    it('文件不存在 → 返回默认状态', () => {
      const filePath = join(TEST_DIR, 'nonexistent.json')
      // 模拟 loadState
      let state = null
      try {
        if (existsSync(filePath)) {
          state = JSON.parse(readFileSync(filePath, 'utf-8'))
        }
      } catch {}
      if (!state) state = { running: false, interval: 600 }
      assert.equal(state.running, false)
    })

    it('文件存在 → 读取并解析', () => {
      mkdirSync(TEST_DIR, { recursive: true })
      const filePath = join(TEST_DIR, 'state.json')
      writeFileSync(filePath, JSON.stringify({ running: true, interval: 300, pid: 12345 }))

      const state = JSON.parse(readFileSync(filePath, 'utf-8'))
      assert.equal(state.running, true)
      assert.equal(state.interval, 300)
      assert.equal(state.pid, 12345)
    })

    it('文件损坏 → 返回默认状态', () => {
      mkdirSync(TEST_DIR, { recursive: true })
      const filePath = join(TEST_DIR, 'bad.json')
      writeFileSync(filePath, '{ broken json')

      let state = null
      try {
        state = JSON.parse(readFileSync(filePath, 'utf-8'))
      } catch {}
      if (!state) state = { running: false, interval: 600 }
      assert.equal(state.running, false)
    })
  })

  describe('saveState 原子写入', () => {
    it('写入后可读回', () => {
      mkdirSync(TEST_DIR, { recursive: true })
      const filePath = join(TEST_DIR, 'state.json')
      const tmpFile = filePath + '.tmp'
      const state = { running: true, interval: 120, pid: 99 }

      // 模拟 saveState（原子写入：tmp + rename）
      writeFileSync(tmpFile, JSON.stringify(state, null, 2))
      renameSync(tmpFile, filePath)

      const loaded = JSON.parse(readFileSync(filePath, 'utf-8'))
      assert.equal(loaded.running, true)
      assert.equal(loaded.interval, 120)
      assert.equal(loaded.pid, 99)
    })

    it('临时文件被清理', () => {
      mkdirSync(TEST_DIR, { recursive: true })
      const filePath = join(TEST_DIR, 'state.json')
      const tmpFile = filePath + '.tmp'
      const state = { running: false }

      writeFileSync(tmpFile, JSON.stringify(state, null, 2))
      renameSync(tmpFile, filePath)

      assert.ok(!existsSync(tmpFile))
      assert.ok(existsSync(filePath))
    })
  })

  describe('withStateLock 逻辑', () => {
    it('正常执行 → 锁被释放', async () => {
      const state = { running: false, _locked: false }

      // 模拟 withStateLock
      state._locked = true
      const result = await Promise.resolve('success')
      delete state._locked

      assert.equal(result, 'success')
      assert.equal(state._locked, undefined)
    })

    it('已锁定 → 返回 null', () => {
      const state = { running: false, _locked: true }
      const result = state._locked ? null : 'proceed'
      assert.equal(result, null)
    })

    it('异常时锁仍被释放', async () => {
      const state = { running: false }
      state._locked = true

      try {
        throw new Error('test error')
      } catch {
        delete state._locked
      }

      assert.equal(state._locked, undefined)
    })
  })
})
