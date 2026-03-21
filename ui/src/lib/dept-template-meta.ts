import core from '@/lib/core-bridge'

export function readDeptTemplates() {
  return core.repo.listDeptTemplates()
}

export function readDeptTemplate(id: string) {
  return core.repo.readDeptTemplate(id)
}
