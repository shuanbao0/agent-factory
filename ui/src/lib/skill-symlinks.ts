/**
 * skill-symlinks.ts — 技能 symlink 管理
 *
 * 委托 core/common/skill-symlinks.cjs 实现。
 */

import core from '@/lib/core-bridge'

export async function findBuiltinSkillsDir(): Promise<string | null> {
  return core.common.skillSymlinks.findBuiltinSkillsDir()
}

export async function resolveSkillDir(slug: string): Promise<string | null> {
  return core.common.skillSymlinks.resolveSkillDir(slug)
}

export async function syncSkillSymlinks(agentId: string, enabledSlugs: string[]) {
  return core.common.skillSymlinks.syncSkillSymlinks(agentId, enabledSlugs)
}
