#!/usr/bin/env node
/**
 * Autopilot — backward-compatible entry point
 *
 * This file is a thin wrapper that delegates to the modular autopilot system.
 * All logic has been moved to scripts/autopilot/ modules.
 *
 * Usage (unchanged):
 *   node scripts/autopilot.cjs                         # 运行一个循环
 *   node scripts/autopilot.cjs --loop                  # 持续循环模式
 *   node scripts/autopilot.cjs --loop --interval 1800  # 每 30 分钟循环
 *   node scripts/autopilot.cjs --stop                  # 停止运行中的循环
 *   node scripts/autopilot.cjs --all                   # 启动全部循环（CEO + 部门循环）
 */
require('./autopilot/index.cjs')
