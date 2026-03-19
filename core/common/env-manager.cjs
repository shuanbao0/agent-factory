'use strict'
/**
 * EnvManager — .env 文件读写
 *
 * 从 ui/src/app/api/env/route.ts 提取的核心逻辑
 */
const { readFileSync, writeFileSync, existsSync } = require('fs')
const { join } = require('path')

const PROJECT_ROOT = join(__dirname, '..', '..')
const ENV_PATH = join(PROJECT_ROOT, '.env')

/**
 * 读取 .env 文件，返回 key-value 对象
 * @returns {Record<string, string>}
 */
function readEnv() {
  if (!existsSync(ENV_PATH)) return {}
  const vars = {}
  const lines = readFileSync(ENV_PATH, 'utf-8').split('\n')
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eqIdx = trimmed.indexOf('=')
    if (eqIdx === -1) continue
    vars[trimmed.slice(0, eqIdx).trim()] = trimmed.slice(eqIdx + 1).trim()
  }
  return vars
}

/**
 * 写入 .env 文件（保留注释行）
 * 注意：不更新 process.env，由调用方自行处理
 * @param {Record<string, string>} vars
 */
function writeEnv(vars) {
  const comments = []
  if (existsSync(ENV_PATH)) {
    const lines = readFileSync(ENV_PATH, 'utf-8').split('\n')
    for (const line of lines) {
      if (line.trim().startsWith('#') || line.trim() === '') {
        comments.push(line)
      }
    }
  }

  const lines = []
  if (comments.length) {
    lines.push(...comments)
    if (comments[comments.length - 1]?.trim() !== '') lines.push('')
  }

  for (const [key, value] of Object.entries(vars)) {
    lines.push(`${key}=${value}`)
  }

  writeFileSync(ENV_PATH, lines.join('\n') + '\n')
}

/**
 * 检查 .env 文件是否存在
 * @returns {boolean}
 */
function hasEnvFile() {
  return existsSync(ENV_PATH)
}

module.exports = { readEnv, writeEnv, hasEnvFile }
