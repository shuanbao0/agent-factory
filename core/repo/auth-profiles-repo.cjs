'use strict'
/**
 * AuthProfilesRepository — auth-profiles.json 数据访问层
 *
 * 设计模式：Repository（继承 BaseRepository）
 *
 * 职责：
 * - 管理 .openclaw-state/agents/main/agent/auth-profiles.json
 * - Setup Token / OAuth 认证配置
 */
const { join } = require('path')
const { BaseRepository } = require('./base.cjs')
const { STATE_DIR } = require('../common/paths.cjs')

const AUTH_PROFILES_PATH = join(STATE_DIR, 'agents', 'main', 'agent', 'auth-profiles.json')

class AuthProfilesRepository extends BaseRepository {
  /**
   * 读取 auth-profiles.json
   * @returns {object|null}
   */
  readProfiles() {
    return this.read(AUTH_PROFILES_PATH)
  }

  /**
   * 写入 auth-profiles.json（原子写入，自动创建目录）
   * @param {object} data
   */
  writeProfiles(data) {
    this.write(AUTH_PROFILES_PATH, data)
  }

  /**
   * 原子更新 auth-profiles.json
   * @param {function} mutator
   * @returns {object}
   */
  updateProfiles(mutator) {
    return this.update(AUTH_PROFILES_PATH, mutator, { version: 1, profiles: {}, lastGood: {}, usageStats: {} })
  }
}

const authProfilesRepo = new AuthProfilesRepository()
module.exports = { AuthProfilesRepository, authProfilesRepo }
