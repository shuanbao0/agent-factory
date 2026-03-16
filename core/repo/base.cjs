'use strict'
/**
 * BaseRepository — 通用 JSON 文件数据访问基类
 *
 * 设计模式：Repository + Template Method + Cache
 *
 * 职责：
 * - 提供 JSON 文件的读取、写入、原子更新三种基本操作
 * - 写入采用 tmp + rename 原子策略，防止写入中断导致文件损坏
 * - 可选 TTL 内存缓存，避免高频轮询场景下反复读磁盘
 *
 * 使用场景：
 * - cacheTtlMs=0   → API 路由（每次请求读最新数据）
 * - cacheTtlMs=30000 → Autopilot 循环（30 秒缓存，降低 IO 压力）
 *
 * 子类：ConfigRepository, DeptStateRepository, DeptConfigRepository,
 *        ProjectMetaRepository, AgentMetaRepository
 */
const { readFileSync, writeFileSync, renameSync, existsSync, mkdirSync } = require('fs')
const { dirname } = require('path')

class BaseRepository {
  /**
   * @param {object} opts
   * @param {number} [opts.cacheTtlMs=0] - 缓存过期时间（毫秒）。0 表示不缓存
   */
  constructor({ cacheTtlMs = 0 } = {}) {
    this._cacheTtlMs = cacheTtlMs
    /** @type {Map<string, {data: object, ts: number}>} 路径 → {数据, 时间戳} */
    this._cache = new Map()
  }

  /**
   * 读取 JSON 文件，支持 TTL 缓存
   *
   * @param {string} filePath - 文件绝对路径
   * @returns {object|null} 解析后的 JSON 对象，文件不存在或解析失败返回 null
   */
  read(filePath) {
    // 命中缓存且未过期 → 直接返回
    if (this._cacheTtlMs > 0) {
      const cached = this._cache.get(filePath)
      if (cached && Date.now() - cached.ts < this._cacheTtlMs) {
        return cached.data
      }
    }
    try {
      if (!existsSync(filePath)) return null
      const data = JSON.parse(readFileSync(filePath, 'utf-8'))
      // 读取成功后更新缓存
      if (this._cacheTtlMs > 0) {
        this._cache.set(filePath, { data, ts: Date.now() })
      }
      return data
    } catch {
      return null
    }
  }

  /**
   * 原子写入 JSON 文件
   *
   * 策略：先写临时文件 → rename 覆盖目标文件（原子操作）
   * 如果 rename 失败（跨设备等），回退到直接写入
   *
   * @param {string} filePath - 文件绝对路径
   * @param {object} data - 要写入的数据
   */
  write(filePath, data) {
    const dir = dirname(filePath)
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    const json = JSON.stringify(data, null, 2) + '\n'
    const tmp = filePath + '.tmp'
    try {
      writeFileSync(tmp, json)
      renameSync(tmp, filePath)  // 原子替换
    } catch {
      writeFileSync(filePath, json)  // 回退：直接写入
    }
    // 写入后同步更新缓存
    if (this._cacheTtlMs > 0) {
      this._cache.set(filePath, { data, ts: Date.now() })
    }
  }

  /**
   * 原子 read-mutate-write：读取 → 修改 → 写回
   *
   * @param {string} filePath - 文件绝对路径
   * @param {function} mutator - (currentData) => newData 修改函数
   * @param {object} [defaultValue={}] - 文件不存在时的默认值
   * @returns {object} 写入后的数据
   */
  update(filePath, mutator, defaultValue = {}) {
    const current = this.read(filePath) ?? defaultValue
    const updated = mutator(current)
    this.write(filePath, updated)
    return updated
  }

  /**
   * 清除缓存
   *
   * @param {string} [filePath] - 指定路径则只清除该条目，不传则清除全部
   */
  invalidate(filePath) {
    if (filePath) this._cache.delete(filePath)
    else this._cache.clear()
  }
}

module.exports = { BaseRepository }
