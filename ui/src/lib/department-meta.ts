/**
 * Department Metadata — facade over core/repo/dept-registry
 */
import core from '@/lib/core-bridge'
import type { Department } from './types'

export function getDefaultDepartments(): Department[] {
  return [
    {
      id: 'dev',
      name: '软件开发部',
      nameEn: 'Software Development',
      emoji: '💻',
      order: 0,
      floorColor: { h: 35, s: 30, b: 15, c: 0 },
      furniture: [
        { type: 'desk', count: 4 },
        { type: 'bookshelf', count: 1 },
        { type: 'plant', count: 2 },
        { type: 'whiteboard', count: 1 },
        { type: 'cooler', count: 1 },
      ],
    },
    {
      id: 'novel',
      name: '网文创作部',
      nameEn: 'Novel Writing',
      emoji: '📚',
      order: 1,
      floorColor: { h: 25, s: 45, b: 5, c: 10 },
      furniture: [
        { type: 'desk', count: 4 },
        { type: 'bookshelf', count: 2 },
        { type: 'plant', count: 1 },
        { type: 'lamp', count: 2 },
        { type: 'meeting_table', count: 1 },
      ],
    },
  ]
}

export function readDepartments(): Department[] {
  return core.repo.deptRegistryRepo.readAll() as Department[]
}

export function writeDepartments(departments: Department[]): void {
  core.repo.deptRegistryRepo.writeAll(departments)
}
