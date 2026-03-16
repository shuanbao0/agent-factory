import type { DepartmentWorkflow } from './types'
import core from '@/lib/core-bridge'

export const DEFAULT_WORKFLOW: DepartmentWorkflow = {
  phases: [
    { key: 'research', labelZh: '调研', labelEn: 'Research' },
    { key: 'design', labelZh: '设计', labelEn: 'Design' },
    { key: 'develop', labelZh: '开发', labelEn: 'Develop' },
    { key: 'test', labelZh: '测试', labelEn: 'Test' },
    { key: 'deploy', labelZh: '部署', labelEn: 'Deploy' },
  ],
  taskTypes: [
    { value: 'research', labelZh: '调研', labelEn: 'Research', color: 'blue' },
    { value: 'design', labelZh: '设计', labelEn: 'Design', color: 'purple' },
    { value: 'coding', labelZh: '开发', labelEn: 'Coding', color: 'green' },
    { value: 'testing', labelZh: '测试', labelEn: 'Testing', color: 'amber' },
    { value: 'review', labelZh: '评审', labelEn: 'Review', color: 'pink' },
  ],
  directories: ['docs', 'design', 'src', 'tests'],
  pipeline: [
    { from: 'coding', to: 'review' },
    { from: 'review', to: 'testing' },
  ],
}

export function getDepartmentWorkflow(deptId?: string | null): DepartmentWorkflow {
  if (!deptId) return DEFAULT_WORKFLOW
  try {
    const config = core.repo.deptConfigRepo.load(deptId)
    if (!config) return DEFAULT_WORKFLOW
    const workflow = (config as Record<string, unknown>).workflow as DepartmentWorkflow | undefined
    if (workflow && workflow.phases?.length > 0) {
      return workflow
    }
  } catch { /* fallback */ }
  return DEFAULT_WORKFLOW
}

export function getWorkflowForProject(project: { department?: string }): DepartmentWorkflow {
  return getDepartmentWorkflow(project.department)
}
