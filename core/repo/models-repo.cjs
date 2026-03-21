'use strict'
/**
 * ModelsRepository — models.json 数据访问层
 *
 * 设计模式：Repository（继承 BaseRepository）
 *
 * 职责：
 * - 管理 config/models.json（模型别名映射）
 * - 确保默认配置存在（从 .default.json 复制）
 */
const { existsSync, copyFileSync } = require('fs')
const { BaseRepository } = require('./base.cjs')
const { MODELS_FILE, MODELS_DEFAULT_FILE } = require('../common/paths.cjs')

class ModelsRepository extends BaseRepository {
  /**
   * 确保 models.json 存在（从 .default.json 复制）
   */
  ensureDefaults() {
    if (!existsSync(MODELS_FILE) && existsSync(MODELS_DEFAULT_FILE)) {
      copyFileSync(MODELS_DEFAULT_FILE, MODELS_FILE)
    }
  }

  /**
   * 读取 models.json
   * @returns {{ providers: Record<string, object>, default: string }}
   */
  readModels() {
    this.ensureDefaults()
    return this.read(MODELS_FILE) || { providers: {}, default: '' }
  }

  /**
   * 写入 models.json（原子写入）
   * @param {object} config
   */
  writeModels(config) {
    this.write(MODELS_FILE, config)
  }

  /**
   * 原子更新 models.json
   * @param {function} mutator
   * @returns {object}
   */
  updateModels(mutator) {
    this.ensureDefaults()
    return this.update(MODELS_FILE, mutator, { providers: {}, default: '' })
  }
}

const modelsRepo = new ModelsRepository()
module.exports = { ModelsRepository, modelsRepo }
