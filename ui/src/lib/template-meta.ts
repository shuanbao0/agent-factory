/**
 * Template Metadata — reads template.json from templates/builtin/ and templates/custom/
 *
 * 委托 core/repo/template.cjs 实现。
 */
import core from '@/lib/core-bridge'

export interface TemplateMeta {
  id: string
  name: string
  description: string
  emoji: string
  category: 'builtin' | 'custom'
  group?: string
  hidden?: boolean
  hasIdentityFiles: boolean
  defaults: {
    model: string
    skills: string[]
    peers: string[]
  }
}

export function readTemplates(): TemplateMeta[] {
  return core.repo.listTemplates() as TemplateMeta[]
}

export function readTemplate(id: string): TemplateMeta | null {
  return core.repo.readTemplate(id) as TemplateMeta | null
}

export function getTemplateDir(id: string): string | null {
  return core.repo.getTemplateDir(id)
}
