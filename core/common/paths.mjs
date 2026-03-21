/**
 * paths.mjs — ESM wrapper for paths.cjs
 *
 * Scripts (*.mjs) 通过此文件访问路径常量。
 */
import { createRequire } from 'module'
const require = createRequire(import.meta.url)
const paths = require('./paths.cjs')
export default paths
