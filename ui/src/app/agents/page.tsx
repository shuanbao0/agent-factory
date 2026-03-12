'use client'
import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAppStore } from '@/lib/store'
import { useTranslation } from '@/lib/i18n'
import { AgentCard } from '@/components/agent-card'
import { AgentForm } from '@/components/agent-form'
import { DepartmentForm } from '@/components/department-form'
import { Badge } from '@/components/ui/badge'
import { Agent, AgentTemplate, Department } from '@/lib/types'
import dynamic from 'next/dynamic'
import {
  Users, Cpu, Plus, RefreshCw, FolderOpen, Archive,
  ChevronDown, ChevronRight, FileText, FolderTree, Trash2, Loader2, X, Monitor,
  Settings2, Pencil
} from 'lucide-react'

const PixelOfficeView = dynamic(
  () => import('@/components/pixel-office').then(m => m.PixelOfficeView),
  { ssr: false, loading: () => <div className="flex items-center justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div> }
)

// ── Types ────────────────────────────────────────────────────────
interface WsFile {
  name: string
  path: string
  size: number
}

interface WorkspaceEntry {
  agentId: string
  files: WsFile[]
  fileCount: number
  totalSize: number
}

interface ArchivedEntry {
  dirName: string
  agentId: string
  archivedAt: string
  files: WsFile[]
  fileCount: number
  totalSize: number
}

type AgentsTab = 'agents' | 'workspaces' | 'pixelOffice'

const OTHER_DEPT: Department = {
  id: 'other',
  name: '其他',
  nameEn: 'Other',
  emoji: '🤖',
  order: 999,
  floorColor: { h: 0, s: 0, b: 0, c: 0 },
  furniture: [],
}

const BUILTIN_GROUP_DEPTS: Record<string, Department> = {
  executive: { id: 'executive', name: '高管层', nameEn: 'Executive', emoji: '👔', order: 0, floorColor: { h: 0, s: 0, b: 0, c: 0 }, furniture: [] },
  dev: { id: 'dev', name: '软件开发部', nameEn: 'Software Development', emoji: '💻', order: 100, floorColor: { h: 0, s: 0, b: 0, c: 0 }, furniture: [] },
  novel: { id: 'novel', name: '网文创作部', nameEn: 'Novel Writing', emoji: '✍️', order: 101, floorColor: { h: 0, s: 0, b: 0, c: 0 }, furniture: [] },
  finance: { id: 'finance', name: '财务部', nameEn: 'Finance', emoji: '💰', order: 102, floorColor: { h: 0, s: 0, b: 0, c: 0 }, furniture: [] },
  sales: { id: 'sales', name: '销售部', nameEn: 'Sales', emoji: '📈', order: 103, floorColor: { h: 0, s: 0, b: 0, c: 0 }, furniture: [] },
  service: { id: 'service', name: '客户服务部', nameEn: 'Customer Service', emoji: '🎧', order: 104, floorColor: { h: 0, s: 0, b: 0, c: 0 }, furniture: [] },
  ops: { id: 'ops', name: '运营部', nameEn: 'Operations', emoji: '🏗️', order: 105, floorColor: { h: 0, s: 0, b: 0, c: 0 }, furniture: [] },
  legal: { id: 'legal', name: '法务合规部', nameEn: 'Legal & Compliance', emoji: '⚖️', order: 106, floorColor: { h: 0, s: 0, b: 0, c: 0 }, furniture: [] },
  research: { id: 'research', name: '研究院', nameEn: 'Research Lab', emoji: '🔬', order: 107, floorColor: { h: 0, s: 0, b: 0, c: 0 }, furniture: [] },
  brand: { id: 'brand', name: '品牌传播部', nameEn: 'Brand & PR', emoji: '📢', order: 108, floorColor: { h: 0, s: 0, b: 0, c: 0 }, furniture: [] },
  anime: { id: 'anime', name: '动漫制作部', nameEn: 'Anime Production', emoji: '🎬', order: 109, floorColor: { h: 0, s: 0, b: 0, c: 0 }, furniture: [] },
}

function AgentGroupedList({ agents, templates, departments, collapsedGroups, onToggleGroup, onEdit, onDelete, t, locale }: {
  agents: Agent[]
  templates: AgentTemplate[]
  departments: Department[]
  collapsedGroups: Set<string>
  onToggleGroup: (g: string) => void
  onEdit: (a: Agent) => void
  onDelete: (id: string) => void
  t: (key: string) => string
  locale: string
}) {
  // Build a map: templateId → group
  const templateGroupMap: Record<string, string> = {}
  for (const tmpl of templates) {
    if (tmpl.group) templateGroupMap[tmpl.id] = tmpl.group
  }

  // Build department lookup
  const deptMap = new Map<string, Department>()
  for (const d of departments) deptMap.set(d.id, d)

  // Group agents by department
  const grouped: Record<string, Agent[]> = {}
  for (const agent of agents) {
    const group = agent.department || (agent.templateId && templateGroupMap[agent.templateId]) || 'other'
    if (!grouped[group]) grouped[group] = []
    grouped[group].push(agent)
  }

  const sortedGroups = Object.keys(grouped).sort((a, b) => {
    const orderA = deptMap.get(a)?.order ?? OTHER_DEPT.order
    const orderB = deptMap.get(b)?.order ?? OTHER_DEPT.order
    return orderA - orderB
  })

  return (
    <div className="space-y-4">
      {sortedGroups.map(groupId => {
        const dept = deptMap.get(groupId) || BUILTIN_GROUP_DEPTS[groupId] || OTHER_DEPT
        const groupAgents = grouped[groupId]
        const isCollapsed = collapsedGroups.has(groupId)

        return (
          <div key={groupId} className="border border-border rounded-xl overflow-hidden">
            <button
              onClick={() => onToggleGroup(groupId)}
              className="w-full flex items-center gap-3 px-5 py-3.5 hover:bg-muted/30 transition-colors text-left"
            >
              {isCollapsed
                ? <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                : <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
              }
              <span className="text-lg">{dept.emoji}</span>
              <span className="font-semibold text-sm">
                {locale === 'zh' ? dept.name : dept.nameEn}
              </span>
              <Badge variant="muted" className="ml-1">{groupAgents.length}</Badge>
            </button>

            {!isCollapsed && (
              <div className="border-t border-border px-4 py-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {groupAgents.map(a => (
                    <AgentCard
                      key={a.id}
                      agent={a}
                      onEdit={() => onEdit(a)}
                      onDelete={() => onDelete(a.id)}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

export default function AgentsPage() {
  const { agents, modelsList, agentModels, defaultModel, fetchModels, setAgentModel, fetchAgents, templates, departments, fetchDepartments } = useAppStore()
  const { t, locale } = useTranslation()
  const router = useRouter()
  const [showCreate, setShowCreate] = useState(false)
  const [editAgent, setEditAgent] = useState<{
    id: string; role: string; name: string; description: string;
    model?: string; templateId?: string | null; skills?: string[]; peers?: string[];
    department?: string
  } | null>(null)
  const [tab, setTab] = useState<AgentsTab>('agents')
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())

  // Department management state
  const [showDeptForm, setShowDeptForm] = useState(false)
  const [editDept, setEditDept] = useState<Department | undefined>(undefined)
  const [showDeptManager, setShowDeptManager] = useState(false)
  const [deletingDept, setDeletingDept] = useState<string | null>(null)

  // ── Workspace tab state ───────────────────────────────────────
  const [workspaces, setWorkspaces] = useState<WorkspaceEntry[]>([])
  const [archived, setArchived] = useState<ArchivedEntry[]>([])
  const [loadingWs, setLoadingWs] = useState(false)
  const [expandedWs, setExpandedWs] = useState<Set<string>>(new Set())
  const [archivesOpen, setArchivesOpen] = useState(false)
  const [previewFile, setPreviewFile] = useState<{ source: string; path: string; content: string } | null>(null)
  const [loadingPreview, setLoadingPreview] = useState(false)

  const online = agents.filter(a => a.status === 'online').length
  const busy = agents.filter(a => a.status === 'busy').length

  useEffect(() => {
    let cancelled = false
    fetchModels()
    // Fix 3: only fetch models for agents not yet cached, stagger requests
    const currentModels = useAppStore.getState().agentModels
    const uncached = agents.filter(a => !currentModels[a.id])
    uncached.forEach((a, i) => {
      setTimeout(() => {
        if (!cancelled) useAppStore.getState().fetchAgentModel(a.id)
      }, i * 50)
    })
    return () => { cancelled = true }
  }, [agents.length, fetchModels])

  // ── Fetch workspaces ──────────────────────────────────────────
  const fetchWorkspaces = useCallback(async () => {
    setLoadingWs(true)
    try {
      const res = await fetch('/api/workspaces')
      if (res.ok) {
        const data = await res.json()
        setWorkspaces(data.workspaces || [])
        setArchived(data.archived || [])
      }
    } catch {} finally { setLoadingWs(false) }
  }, [])

  useEffect(() => {
    if (tab === 'workspaces') fetchWorkspaces()
  }, [tab, fetchWorkspaces])

  const handleDelete = async (id: string) => {
    if (!confirm(t('agents.confirmDelete'))) return
    try {
      await fetch('/api/agents', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      fetchAgents()
    } catch {}
  }

  const handleSaved = (createdAgentId?: string, skipAutoInit?: boolean) => {
    fetchAgents()
    setShowCreate(false)
    setEditAgent(null)
    if (createdAgentId) {
      router.push(`/agents/${createdAgentId}${skipAutoInit ? '' : '?autoInit=true'}`)
    }
  }

  const handleDeleteDept = async (deptId: string) => {
    if (!confirm(t('agents.deptDeleteConfirm'))) return
    setDeletingDept(deptId)
    try {
      const res = await fetch('/api/departments', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: deptId }),
      })
      if (res.ok) {
        fetchDepartments()
        fetchAgents()
      }
    } catch {} finally { setDeletingDept(null) }
  }

  // ── Workspace helpers ─────────────────────────────────────────
  const toggleWsExpand = (agentId: string) => {
    setExpandedWs(prev => {
      const next = new Set(prev)
      if (next.has(agentId)) next.delete(agentId)
      else next.add(agentId)
      return next
    })
  }

  const previewWsFile = async (agentId: string, filePath: string) => {
    setLoadingPreview(true)
    try {
      const res = await fetch(`/api/workspaces?agentId=${encodeURIComponent(agentId)}&file=${encodeURIComponent(filePath)}`)
      if (res.ok) {
        const data = await res.json()
        setPreviewFile({ source: `${agentId}/${filePath}`, path: filePath, content: data.content || '' })
      }
    } catch {} finally { setLoadingPreview(false) }
  }

  const previewArchivedFile = async (dirName: string, filePath: string) => {
    setLoadingPreview(true)
    try {
      const res = await fetch(`/api/workspaces?archived=${encodeURIComponent(dirName)}&file=${encodeURIComponent(filePath)}`)
      if (res.ok) {
        const data = await res.json()
        setPreviewFile({ source: `archived/${dirName}/${filePath}`, path: filePath, content: data.content || '' })
      }
    } catch {} finally { setLoadingPreview(false) }
  }

  const deleteArchive = async (dirName: string) => {
    if (!confirm(t('agents.wsDeleteConfirm'))) return
    try {
      const res = await fetch('/api/workspaces', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dirName }),
      })
      if (res.ok) {
        setArchived(prev => prev.filter(a => a.dirName !== dirName))
      }
    } catch {}
  }

  const formatSize = (bytes: number): string => {
    if (bytes >= 1_048_576) return (bytes / 1_048_576).toFixed(1) + ' MB'
    if (bytes >= 1024) return (bytes / 1024).toFixed(1) + ' KB'
    return bytes + ' B'
  }

  const formatArchiveTime = (ts: string): string => {
    if (!ts) return '—'
    try {
      const d = new Date(ts)
      if (isNaN(d.getTime())) return ts
      return d.toLocaleString()
    } catch {
      return ts
    }
  }

  // ── Build department grouping for workspaces ─────────────────
  const deptMap = new Map<string, Department>()
  for (const d of departments) deptMap.set(d.id, d)

  const templateGroupMap: Record<string, string> = {}
  for (const tmpl of templates) {
    if (tmpl.group) templateGroupMap[tmpl.id] = tmpl.group
  }

  const getAgentDepartment = (agentId: string): string => {
    const agent = agents.find(a => a.id === agentId)
    if (!agent) return 'other'
    return agent.department || (agent.templateId && templateGroupMap[agent.templateId]) || 'other'
  }

  // ── Workspaces tab content ────────────────────────────────────
  const WorkspacesTab = () => {
    // Group workspaces by department
    const wsByDept: Record<string, WorkspaceEntry[]> = {}
    for (const ws of workspaces) {
      const dept = getAgentDepartment(ws.agentId)
      if (!wsByDept[dept]) wsByDept[dept] = []
      wsByDept[dept].push(ws)
    }
    const sortedDepts = Object.keys(wsByDept).sort((a, b) => {
      const orderA = deptMap.get(a)?.order ?? 999
      const orderB = deptMap.get(b)?.order ?? 999
      return orderA - orderB
    })

    return (
      <div className="space-y-6">
        {/* Active workspaces */}
        <div>
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <FolderOpen className="w-5 h-5" /> {t('agents.wsActiveWorkspaces')}
          </h2>

          {loadingWs ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : workspaces.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <FolderOpen className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p>{t('agents.wsNoWorkspaces')}</p>
              <p className="text-xs mt-1">{t('agents.wsNoWorkspacesHint')}</p>
            </div>
          ) : (
            <div className="space-y-4">
              {sortedDepts.map(deptId => {
                const dept = deptMap.get(deptId) || OTHER_DEPT
                const deptWorkspaces = wsByDept[deptId]
                return (
                  <div key={deptId}>
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-lg">{dept.emoji}</span>
                      <span className="text-sm font-semibold">{locale === 'zh' ? dept.name : dept.nameEn}</span>
                      <Badge variant="muted">{deptWorkspaces.length}</Badge>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {deptWorkspaces.map(ws => (
                        <div key={ws.agentId} className="border border-border rounded-xl overflow-hidden">
                          <button
                            onClick={() => toggleWsExpand(ws.agentId)}
                            className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors text-left"
                          >
                            {expandedWs.has(ws.agentId) ? (
                              <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
                            ) : (
                              <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                            )}
                            <FolderOpen className="w-4 h-4 text-amber-400 shrink-0" />
                            <span className="font-medium text-sm truncate">{ws.agentId}</span>
                            <span className="ml-auto text-xs text-muted-foreground whitespace-nowrap">
                              {ws.fileCount} {t('agents.wsFiles')} · {formatSize(ws.totalSize)}
                            </span>
                          </button>

                          {expandedWs.has(ws.agentId) && (
                            <div className="border-t border-border px-2 py-2 max-h-60 overflow-y-auto">
                              {ws.files.map(f => (
                                <button
                                  key={f.path}
                                  onClick={() => previewWsFile(ws.agentId, f.path)}
                                  className={`w-full flex items-center gap-2 px-3 py-1.5 rounded-md text-xs transition-colors text-left ${
                                    previewFile?.source === `${ws.agentId}/${f.path}`
                                      ? 'bg-primary/10 text-primary'
                                      : 'hover:bg-muted/50 text-muted-foreground'
                                  }`}
                                >
                                  <FileText className="w-3.5 h-3.5 shrink-0" />
                                  <span className="truncate">{f.path}</span>
                                  <span className="ml-auto text-[10px] shrink-0">{formatSize(f.size)}</span>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Archives */}
        <div>
          <button
            onClick={() => setArchivesOpen(!archivesOpen)}
            className="flex items-center gap-2 text-lg font-semibold mb-4 hover:text-primary transition-colors"
          >
            {archivesOpen ? <ChevronDown className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
            <Archive className="w-5 h-5" />
            {t('agents.wsArchives')}
            {archived.length > 0 && (
              <Badge variant="muted" className="ml-1">{archived.length}</Badge>
            )}
          </button>

          {archivesOpen && (
            <div className="space-y-3">
              {archived.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground text-sm">
                  <Archive className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  <p>{t('agents.wsNoArchives')}</p>
                </div>
              ) : (
                archived.map(arch => (
                  <div key={arch.dirName} className="border border-border rounded-xl overflow-hidden">
                    <div className="flex items-center gap-3 px-4 py-3">
                      <button
                        onClick={() => toggleWsExpand(`arch-${arch.dirName}`)}
                        className="flex items-center gap-3 flex-1 min-w-0 text-left"
                      >
                        {expandedWs.has(`arch-${arch.dirName}`) ? (
                          <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
                        ) : (
                          <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                        )}
                        <Archive className="w-4 h-4 text-muted-foreground shrink-0" />
                        <div className="min-w-0">
                          <span className="font-medium text-sm block truncate">{arch.dirName}</span>
                          <span className="text-xs text-muted-foreground">
                            {t('agents.wsSource')}: {arch.agentId}
                            {arch.archivedAt && ` · ${t('agents.wsArchivedAt')}: ${formatArchiveTime(arch.archivedAt)}`}
                            {` · ${arch.fileCount} ${t('agents.wsFiles')} · ${formatSize(arch.totalSize)}`}
                          </span>
                        </div>
                      </button>
                      <button
                        onClick={() => deleteArchive(arch.dirName)}
                        className="p-1.5 text-muted-foreground hover:text-red-400 transition-colors shrink-0"
                        title={t('agents.wsDeleteArchive')}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    {expandedWs.has(`arch-${arch.dirName}`) && (
                      <div className="border-t border-border px-2 py-2 max-h-60 overflow-y-auto">
                        {arch.files.map(f => (
                          <button
                            key={f.path}
                            onClick={() => previewArchivedFile(arch.dirName, f.path)}
                            className={`w-full flex items-center gap-2 px-3 py-1.5 rounded-md text-xs transition-colors text-left ${
                              previewFile?.source === `archived/${arch.dirName}/${f.path}`
                                ? 'bg-primary/10 text-primary'
                                : 'hover:bg-muted/50 text-muted-foreground'
                            }`}
                          >
                            <FileText className="w-3.5 h-3.5 shrink-0" />
                            <span className="truncate">{f.path}</span>
                            <span className="ml-auto text-[10px] shrink-0">{formatSize(f.size)}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* File preview panel */}
        {previewFile && (
          <div className="border border-border rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2 bg-muted/30 border-b border-border">
              <span className="text-sm font-medium font-mono truncate">{previewFile.source}</span>
              <button
                onClick={() => setPreviewFile(null)}
                className="p-1 text-muted-foreground hover:text-foreground shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4">
              {loadingPreview ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <pre className="text-xs font-mono whitespace-pre-wrap break-words bg-muted/30 p-3 rounded-lg max-h-[50vh] overflow-y-auto">
                  {previewFile.content}
                </pre>
              )}
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Users className="w-6 h-6" /> {t('agents.title')}</h1>
          <p className="text-sm text-muted-foreground mt-1">{t('agents.subtitle')}</p>
        </div>
        <div className="flex gap-2 items-center flex-wrap">
          <Badge variant="success">{online} {t('common.online')}</Badge>
          <Badge variant="warning">{busy} {t('common.busy')}</Badge>
          <button
            onClick={() => fetchAgents()}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-border rounded-lg hover:bg-muted"
          >
            <RefreshCw className="w-4 h-4" /> {t('common.refresh')}
          </button>
          {tab === 'agents' && (
            <>
              <button
                onClick={() => setShowDeptManager(!showDeptManager)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-border rounded-lg hover:bg-muted"
              >
                <Settings2 className="w-4 h-4" /> {t('agents.manageDepartments')}
              </button>
              <button
                onClick={() => setShowCreate(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded-lg hover:bg-primary/90"
              >
                <Plus className="w-4 h-4" /> {t('agents.createAgent')}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Department Manager (inline) */}
      {showDeptManager && tab === 'agents' && (
        <div className="border border-border rounded-xl p-4 space-y-3 bg-muted/10">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">{t('agents.manageDepartments')}</h3>
            <button
              onClick={() => { setShowDeptForm(true); setEditDept(undefined) }}
              className="flex items-center gap-1 px-2.5 py-1 text-xs bg-primary text-primary-foreground rounded-lg hover:bg-primary/90"
            >
              <Plus className="w-3.5 h-3.5" /> {t('agents.createDepartment')}
            </button>
          </div>
          <div className="space-y-2">
            {departments.map(dept => (
              <div key={dept.id} className="flex items-center gap-3 px-3 py-2 bg-card border border-border rounded-lg">
                <span className="text-lg">{dept.emoji}</span>
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-medium">{locale === 'zh' ? dept.name : dept.nameEn}</span>
                  <span className="text-xs text-muted-foreground ml-2">({dept.id})</span>
                </div>
                <span className="text-xs text-muted-foreground">{t('agents.deptOrder')}: {dept.order}</span>
                <button
                  onClick={() => { setEditDept(dept); setShowDeptForm(true) }}
                  className="p-1 text-muted-foreground hover:text-foreground"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => handleDeleteDept(dept.id)}
                  disabled={deletingDept === dept.id}
                  className="p-1 text-muted-foreground hover:text-red-400 disabled:opacity-50"
                >
                  {deletingDept === dept.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                </button>
              </div>
            ))}
            {departments.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">{t('agents.noDepartment')}</p>
            )}
          </div>
        </div>
      )}

      {/* Tab bar */}
      <div className="flex gap-1 border-b border-border">
        <button
          onClick={() => setTab('agents')}
          className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
            tab === 'agents'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <Users className="w-4 h-4" />
          {t('agents.tabAgents')}
        </button>
        <button
          onClick={() => setTab('workspaces')}
          className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
            tab === 'workspaces'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <FolderOpen className="w-4 h-4" />
          {t('agents.tabWorkspaces')}
        </button>
        <button
          onClick={() => setTab('pixelOffice')}
          className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
            tab === 'pixelOffice'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <Monitor className="w-4 h-4" />
          {t('agents.tabPixelOffice')}
        </button>
      </div>

      {/* Tab content */}
      {tab === 'agents' && (
        <>
          {agents.length > 0 ? (
            <AgentGroupedList
              agents={agents}
              templates={templates}
              departments={departments}
              collapsedGroups={collapsedGroups}
              onToggleGroup={(g) => {
                setCollapsedGroups(prev => {
                  const next = new Set(prev)
                  if (next.has(g)) next.delete(g)
                  else next.add(g)
                  return next
                })
              }}
              onEdit={(a) => setEditAgent({
                id: a.id,
                role: a.role,
                name: a.name,
                description: a.description,
                model: agentModels[a.id],
                templateId: a.templateId,
                department: a.department,
              })}
              onDelete={(id) => handleDelete(id)}
              t={t}
              locale={locale}
            />
          ) : (
            <div className="text-center py-16 text-muted-foreground">
              <Users className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>{t('agents.noAgents')}</p>
              <button
                onClick={() => setShowCreate(true)}
                className="mt-4 px-4 py-2 text-sm bg-primary text-primary-foreground rounded-lg hover:bg-primary/90"
              >
                {t('agents.createFirst')}
              </button>
            </div>
          )}

          {/* Agent Model Assignment */}
          {agents.length > 0 && (
            <div className="mt-8">
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <Cpu className="w-5 h-5" /> {t('agents.modelAssignment')}
              </h2>
              <div className="border border-border rounded-xl overflow-hidden overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted/50 border-b border-border">
                      <th className="text-left px-4 py-3 font-medium">{t('agents.agent')}</th>
                      <th className="text-left px-4 py-3 font-medium">{t('templates.template')}</th>
                      <th className="text-left px-4 py-3 font-medium">{t('agents.assignedModel')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {agents.map(a => {
                      const tmpl = a.templateId ? templates.find(t => t.id === a.templateId) : null
                      return (
                        <tr key={a.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                          <td className="px-4 py-3 font-medium">{a.name}</td>
                          <td className="px-4 py-3">
                            {tmpl ? (
                              <span className="text-muted-foreground">{tmpl.emoji} {tmpl.id}</span>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <select
                              value={agentModels[a.id] || ''}
                              onChange={e => setAgentModel(a.id, e.target.value)}
                              className="bg-muted border border-border rounded-lg px-2 py-1 text-sm min-w-[200px] focus:outline-none focus:ring-2 focus:ring-primary/50"
                            >
                              <option value="">Default ({defaultModel})</option>
                              {modelsList.map(m => (
                                <option key={m.ref} value={m.ref}>
                                  {m.ref} → {m.modelId}
                                </option>
                              ))}
                            </select>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {tab === 'workspaces' && <WorkspacesTab />}

      {tab === 'pixelOffice' && <PixelOfficeView isVisible={tab === 'pixelOffice'} />}

      {/* Create/Edit Agent Dialog */}
      {showCreate && (
        <AgentForm onClose={() => setShowCreate(false)} onSaved={handleSaved} />
      )}
      {editAgent && (
        <AgentForm editAgent={editAgent} onClose={() => setEditAgent(null)} onSaved={handleSaved} />
      )}

      {/* Create/Edit Department Dialog */}
      {showDeptForm && (
        <DepartmentForm
          editDept={editDept}
          onClose={() => { setShowDeptForm(false); setEditDept(undefined) }}
          onSaved={() => { fetchDepartments() }}
        />
      )}
    </div>
  )
}
