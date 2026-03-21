/**
 * DepartmentTemplate — 部门模板类型定义
 */
import type { DepartmentFurnitureItem, DepartmentWorkflow } from './dept'

export interface DepartmentTemplate {
  id: string
  name: string
  nameEn: string
  description: string
  descriptionEn: string
  emoji: string
  category: 'builtin' | 'custom'
  recommendedAgents: string[]
  defaults: {
    head: string
    interval: number
    budget: { dailyTokenLimit: number; alertThreshold: number }
    kpis: Record<string, { target: number; unit: string }>
    workflow: DepartmentWorkflow
    floorColor: { h: number; s: number; b: number; c: number }
    furniture: DepartmentFurnitureItem[]
    order: number
  }
}
