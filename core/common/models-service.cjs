'use strict'
/**
 * ModelsService — models.json 同步到 openclaw.json 的核心逻辑
 *
 * 从 ui/src/app/api/models/route.ts 提取
 *
 * 依赖注入：惰性 require configRepo、modelsRepo
 */

/**
 * 解析环境变量引用 ${VAR_NAME}
 * @param {string} value
 * @param {Record<string, string>} [envVars]
 * @returns {string}
 */
function resolveEnvVar(value, envVars) {
  const env = envVars || process.env
  return value.replace(/\$\{(\w+)\}/g, (_, name) => env[name] || '')
}

module.exports = { resolveEnvVar }
