'use client'
import { useEffect, useState, useCallback } from 'react'
import { useTranslation } from '@/lib/i18n'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { PhaseProgress } from '@/components/phase-progress'
import { FolderKanban, Clock, Zap, Plus, Trash2, Loader2, FolderOpen, FileText, FolderTree, Code2, ListChecks, AlertTriangle, Play, Square, ExternalLink, Monitor } from 'lucide-react'
import { formatNumber, formatDate } from '@/lib/utils'
import { Task } from '@/lib/types'

const ROLE_EMOJI: Record<string, string> = {
  ceo: '👔', pm: '📋', product: '📦', designer: '🎨',
  frontend: '💻', backend: '⚙️', tester: '🧪', researcher: '🔬',
  marketing: '📣', analyst: '📊', writer: '✍️',
}

interface PhaseDefinition {
  key: string
  labelZh: string
  labelEn: string
}

interface FsProject {
  id: string
  name: string
  description?: string
  status: 'planning' | 'in-progress' | 'completed' | 'paused' | 'unknown'
  currentPhase?: number
  totalPhases?: number
  phases?: PhaseDefinition[]
  department?: string
  tasks?: Task[]
  assignedAgents?: string[]
  tokensUsed?: number
  createdAt?: string
  codeLocation?: string
  blockers?: string[]
}

interface FileEntry {
  name: string
  type: 'file' | 'directory'
  size?: number
  path: string
  source: 'project' | 'code'
}

const statusVariant = {
  'planning': 'muted', 'in-progress': 'success',
  'completed': 'default', 'paused': 'warning', 'unknown': 'muted',
} as const

const taskStatus: Record<string, 'muted' | 'warning' | 'success' | 'danger' | 'default'> = {
  pending: 'muted', assigned: 'muted', running: 'warning', in_progress: 'warning', review: 'warning', completed: 'success', failed: 'danger',
}

type DetailTab = 'overview' | 'files' | 'preview'

function ProjectDetail({
  project,
  onDelete,
  deleting,
}: {
  project: FsProject
  onDelete: () => void
  deleting: boolean
}) {
  const { t } = useTranslation()
  const [tab, setTab] = useState<DetailTab>('overview')
  const [files, setFiles] = useState<FileEntry[]>([])
  const [loadingFiles, setLoadingFiles] = useState(false)
  const [fileContent, setFileContent] = useState<{ name: string; path: string; content: string; source: string } | null>(null)
  const [loadingContent, setLoadingContent] = useState(false)

  const fetchFiles = useCallback(async () => {
    setLoadingFiles(true)
    try {
      const res = await fetch(`/api/projects/${project.id}/files`)
      const data = await res.json()
      setFiles(data.files ?? [])
    } catch { setFiles([]) }
    setLoadingFiles(false)
  }, [project.id])

  useEffect(() => {
    if (tab === 'files' && files.length === 0) fetchFiles()
  }, [tab, files.length, fetchFiles])

  // Reset when project changes
  useEffect(() => {
    setTab('overview')
    setFiles([])
    setFileContent(null)
  }, [project.id])

  const fetchFileContent = async (path: string, name: string, source: string) => {
    setLoadingContent(true)
    try {
      const res = await fetch(`/api/projects/${project.id}/files?file=${encodeURIComponent(path)}&source=${source}`)
      const data = await res.json()
      setFileContent({ name, path, content: data.content ?? data.error ?? '', source })
    } catch {
      setFileContent({ name, path, content: '(Failed to load)', source })
    }
    setLoadingContent(false)
  }

  const tabs: { id: DetailTab; label: string; icon: React.ReactNode }[] = [
    { id: 'overview', label: t('projects.overview') || 'Overview', icon: <ListChecks className="w-3.5 h-3.5" /> },
    { id: 'files', label: t('projects.files') || 'Files', icon: <Code2 className="w-3.5 h-3.5" /> },
    ...(project.codeLocation ? [{ id: 'preview' as DetailTab, label: 'Preview', icon: <Monitor className="w-3.5 h-3.5" /> }] : []),
  ]

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <CardTitle className="text-base">{project.name}</CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant={statusVariant[project.status] ?? 'muted'}>{project.status}</Badge>
            {project.codeLocation && (
              <button
                onClick={() => setTab('preview')}
                className="flex items-center gap-1 px-2 py-1 text-xs text-emerald-400 border border-emerald-400/30 rounded-md hover:bg-emerald-400/10 transition-colors"
              >
                <Play className="w-3 h-3" /> Preview
              </button>
            )}
            <button
              onClick={onDelete}
              disabled={deleting}
              className="flex items-center gap-1 px-2 py-1 text-xs text-red-400 border border-red-400/30 rounded-md hover:bg-red-400/10 disabled:opacity-50 transition-colors"
            >
              {deleting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
              {t('common.delete')}
            </button>
          </div>
        </div>
        {project.description && (
          <p className="text-xs text-muted-foreground">{project.description}</p>
        )}

        {/* Tabs */}
        <div className="flex gap-1 mt-3 border-b border-border pb-0">
          {tabs.map(tb => (
            <button
              key={tb.id}
              onClick={() => setTab(tb.id)}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-t-lg transition-colors -mb-px ${
                tab === tb.id
                  ? 'bg-card border border-border border-b-transparent text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {tb.icon} {tb.label}
            </button>
          ))}
        </div>
      </CardHeader>

      <CardContent>
        {tab === 'overview' && <OverviewTab project={project} />}
        {tab === 'files' && (
          <FilesTab
            files={files}
            loading={loadingFiles}
            fileContent={fileContent}
            loadingContent={loadingContent}
            onSelectFile={fetchFileContent}
            onCloseFile={() => setFileContent(null)}
            onRefresh={fetchFiles}
          />
        )}
        {tab === 'preview' && <PreviewTab projectId={project.id} />}
      </CardContent>
    </Card>
  )
}

function OverviewTab({ project }: { project: FsProject }) {
  const { t } = useTranslation()
  return (
    <div className="space-y-4">
      {/* Blockers banner — needs user attention */}
      {(project.blockers?.length ?? 0) > 0 && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
            <span className="text-sm font-semibold text-amber-300">{t('projects.blockers') || 'Needs your input'}</span>
          </div>
          <ul className="space-y-1.5">
            {project.blockers!.map((b, i) => (
              <li key={i} className="text-xs text-amber-200/80 flex items-start gap-2">
                <span className="text-amber-400 mt-0.5 shrink-0">&#9679;</span>
                <span>{b}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <PhaseProgress current={project.currentPhase ?? 1} total={project.totalPhases ?? 5} phases={project.phases} />

      <div className="flex gap-4 text-xs text-muted-foreground">
        {project.createdAt && (
          <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{formatDate(project.createdAt)}</span>
        )}
        <span className="flex items-center gap-1"><Zap className="w-3 h-3" />{formatNumber(project.tokensUsed ?? 0)} {t('common.tokens')}</span>
      </div>

      {/* Assigned Agents */}
      {(project.assignedAgents?.length ?? 0) > 0 && (
        <div>
          <h4 className="text-xs font-medium text-muted-foreground mb-2">{t('projects.assignedAgents')}</h4>
          <div className="flex flex-wrap gap-1.5">
            {project.assignedAgents!.map(agentId => (
              <span key={agentId} className="flex items-center gap-1 px-2 py-1 rounded-md bg-accent text-xs">
                <span>{ROLE_EMOJI[agentId] ?? '🤖'}</span>
                <span>{agentId}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Tasks */}
      {(project.tasks?.length ?? 0) > 0 && (
        <div>
          <h4 className="text-sm font-medium mb-2">{t('projects.tasks')}</h4>
          <div className="space-y-2">
            {project.tasks!.map(task => (
              <div key={task.id} className="flex items-center gap-3 p-2 rounded-lg bg-muted/50">
                <Badge variant={taskStatus[task.status]} className="w-20 justify-center">{task.status}</Badge>
                <span className="text-sm flex-1">{task.name}</span>
                <span className="text-xs text-muted-foreground">P{task.phase}</span>
                <div className="w-24 bg-muted rounded-full h-1.5">
                  <div className="bg-primary h-full rounded-full transition-all" style={{ width: `${task.progress}%` }} />
                </div>
                <span className="text-xs text-muted-foreground w-8 text-right">{task.progress}%</span>
              </div>
            ))}
          </div>

          <h4 className="text-sm font-medium mt-4 mb-2">{t('projects.taskDependencies')}</h4>
          <div className="bg-muted/30 rounded-lg p-4 text-xs font-mono space-y-1">
            {project.tasks!.map(task => (
              <div key={task.id} className="flex items-center gap-2">
                <span className="text-primary">{task.id}</span>
                <span className="text-muted-foreground">{task.name}</span>
                {(task.dependencies && task.dependencies.length > 0) && (
                  <>
                    <span className="text-muted-foreground">&larr;</span>
                    <span className="text-amber-400">{task.dependencies.join(', ')}</span>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function FilesTab({
  files,
  loading,
  fileContent,
  loadingContent,
  onSelectFile,
  onCloseFile,
  onRefresh,
}: {
  files: FileEntry[]
  loading: boolean
  fileContent: { name: string; path: string; content: string; source: string } | null
  loadingContent: boolean
  onSelectFile: (path: string, name: string, source: string) => void
  onCloseFile: () => void
  onRefresh: () => void
}) {
  const { t } = useTranslation()

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (files.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <FolderOpen className="w-10 h-10 mx-auto mb-2 opacity-30" />
        <p className="text-sm">{t('projects.noFiles') || 'No files found'}</p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
      {/* File tree */}
      <div className="border border-border rounded-lg overflow-hidden">
        <div className="flex items-center justify-between px-3 py-2 bg-muted/30 border-b border-border">
          <span className="text-xs font-medium text-muted-foreground flex items-center gap-1">
            <FolderTree className="w-3.5 h-3.5" /> {files.filter(f => f.type === 'file').length} files
          </span>
          <button onClick={onRefresh} className="text-xs text-muted-foreground hover:text-foreground">
            Refresh
          </button>
        </div>
        <div className="max-h-[55vh] overflow-y-auto">
          {files.map((f, i) => {
            const depth = f.path.split('/').length - 1
            const indent = depth * 16
            return (
              <button
                key={`${f.source}-${f.path}-${i}`}
                onClick={() => f.type === 'file' && onSelectFile(f.path, f.name, f.source)}
                className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs transition-colors border-b border-border/50 last:border-0 ${
                  fileContent?.path === f.path && fileContent?.source === f.source
                    ? 'bg-primary/10 text-foreground'
                    : f.type === 'file' ? 'hover:bg-muted/50 cursor-pointer' : 'text-muted-foreground'
                }`}
                style={{ paddingLeft: `${12 + indent}px` }}
                disabled={f.type === 'directory'}
              >
                {f.type === 'directory'
                  ? <FolderTree className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  : <FileText className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                }
                <span className="truncate">{f.name}</span>
                {f.source === 'project' && f.type === 'file' && (
                  <span className="ml-auto text-[10px] text-emerald-500 shrink-0">doc</span>
                )}
                {f.size !== undefined && (
                  <span className="ml-auto text-[10px] text-muted-foreground shrink-0">
                    {f.size > 1024 ? `${(f.size / 1024).toFixed(1)}K` : `${f.size}B`}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* File preview */}
      <div className="border border-border rounded-lg overflow-hidden">
        <div className="px-3 py-2 bg-muted/30 border-b border-border">
          {fileContent ? (
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono font-medium truncate">{fileContent.path}</span>
              <button
                onClick={onCloseFile}
                className="text-xs text-muted-foreground hover:text-foreground ml-2 shrink-0"
              >
                &times;
              </button>
            </div>
          ) : (
            <span className="text-xs text-muted-foreground">{t('agents.selectFile') || 'Select a file to preview'}</span>
          )}
        </div>
        <div className="max-h-[55vh] overflow-y-auto">
          {loadingContent ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
            </div>
          ) : fileContent ? (
            <pre className="text-xs font-mono whitespace-pre-wrap break-words p-3 leading-relaxed">
              {fileContent.content}
            </pre>
          ) : (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <FileText className="w-8 h-8 opacity-20" />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

interface PreviewStatus {
  running: boolean
  ready?: boolean
  port?: number | null
  pid?: number
  type?: string
  url?: string | null
  error?: string
}

function PreviewTab({ projectId }: { projectId: string }) {
  const [status, setStatus] = useState<PreviewStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [starting, setStarting] = useState(false)
  const [stopping, setStopping] = useState(false)

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}/preview`)
      const data = await res.json()
      setStatus(data)
    } catch {
      setStatus({ running: false })
    }
    setLoading(false)
  }, [projectId])

  useEffect(() => { fetchStatus() }, [fetchStatus])

  // Poll while starting (waiting for server to be ready)
  useEffect(() => {
    if (!starting || !status?.running) return
    if (status?.ready) { setStarting(false); return }
    const timer = setInterval(fetchStatus, 2000)
    return () => clearInterval(timer)
  }, [starting, status?.running, status?.ready, fetchStatus])

  const handleStart = async () => {
    setStarting(true)
    try {
      const res = await fetch(`/api/projects/${projectId}/preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'start' }),
      })
      const data = await res.json()
      if (data.error) {
        setStatus({ running: false, error: data.error })
        setStarting(false)
        return
      }
      setStatus({ running: true, ready: data.ready, port: data.port, url: data.url, type: data.type, pid: data.pid })
    } catch {
      setStarting(false)
    }
  }

  const handleStop = async () => {
    setStopping(true)
    try {
      await fetch(`/api/projects/${projectId}/preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'stop' }),
      })
      setStatus({ running: false })
    } catch {}
    setStopping(false)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  // Not running — show start button
  if (!status?.running) {
    return (
      <div className="text-center py-16">
        <Monitor className="w-12 h-12 mx-auto mb-3 opacity-30 text-muted-foreground" />
        <p className="text-sm text-muted-foreground mb-4">
          {status?.error || 'Dev server is not running'}
        </p>
        <button
          onClick={handleStart}
          disabled={starting}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-500 disabled:opacity-50 transition-colors"
        >
          {starting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
          Start Server
        </button>
      </div>
    )
  }

  // Running but not ready yet
  if (!status.ready) {
    return (
      <div className="text-center py-16">
        <Loader2 className="w-8 h-8 mx-auto mb-3 animate-spin text-emerald-400" />
        <p className="text-sm text-muted-foreground">Starting server on port {status.port}...</p>
      </div>
    )
  }

  // Running and ready — show iframe
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs">
          <span className="flex items-center gap-1 text-emerald-400">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            Running on port {status.port}
          </span>
          <a
            href={status.url!}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-blue-400 hover:text-blue-300 transition-colors"
          >
            <ExternalLink className="w-3 h-3" /> Open in new tab
          </a>
        </div>
        <button
          onClick={handleStop}
          disabled={stopping}
          className="flex items-center gap-1 px-2 py-1 text-xs text-red-400 border border-red-400/30 rounded-md hover:bg-red-400/10 disabled:opacity-50 transition-colors"
        >
          {stopping ? <Loader2 className="w-3 h-3 animate-spin" /> : <Square className="w-3 h-3" />}
          Stop
        </button>
      </div>
      <div className="border border-border rounded-lg overflow-hidden bg-white">
        <iframe
          src={status.url!}
          className="w-full border-0"
          style={{ height: '70vh' }}
          title="Project Preview"
        />
      </div>
    </div>
  )
}

interface DeptOption {
  id: string
  name: string
}

export default function ProjectsPage() {
  const { t } = useTranslation()
  const [projects, setProjects] = useState<FsProject[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [newDept, setNewDept] = useState('')
  const [departments, setDepartments] = useState<DeptOption[]>([])
  const [creating, setCreating] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const fetchProjects = async () => {
    try {
      const res = await fetch('/api/projects')
      const data = await res.json()
      setProjects(data.projects ?? [])
    } catch {}
    setLoading(false)
  }

  useEffect(() => { fetchProjects() }, [])

  // Load departments for the create form
  useEffect(() => {
    fetch('/api/autopilot/departments')
      .then(r => r.json())
      .then(data => {
        const depts = (data.departments || []).map((d: Record<string, unknown>) => ({ id: d.id as string, name: (d.name || d.id) as string }))
        setDepartments(depts)
      })
      .catch(() => {})
  }, [])

  const handleCreate = async () => {
    if (!newName.trim()) return
    setCreating(true)
    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim(), description: newDesc.trim(), department: newDept || undefined }),
      })
      const data = await res.json()
      if (data.ok) {
        setShowCreate(false)
        setNewName('')
        setNewDesc('')
        setNewDept('')
        await fetchProjects()
        setSelected(data.project.id)
      }
    } catch {}
    setCreating(false)
  }

  const handleDelete = async (id: string) => {
    if (!confirm(t('projects.confirmDelete'))) return
    setDeleting(true)
    try {
      await fetch(`/api/projects/${id}`, { method: 'DELETE' })
      await fetchProjects()
      setSelected(null)
    } catch {}
    setDeleting(false)
  }

  const selectedProject = projects.find(p => p.id === selected)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <FolderKanban className="w-6 h-6" /> {t('projects.title')}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">{t('projects.subtitle')}</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded-lg hover:bg-primary/90"
        >
          <Plus className="w-4 h-4" /> {t('projects.createProject')}
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="w-6 h-6 animate-spin mr-2" /> Loading...
        </div>
      ) : projects.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <FolderKanban className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>{t('projects.noProjects')}</p>
          <button
            onClick={() => setShowCreate(true)}
            className="mt-4 px-4 py-2 text-sm bg-primary text-primary-foreground rounded-lg hover:bg-primary/90"
          >
            {t('projects.createFirst')}
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Project list */}
          <div className="space-y-3">
            {projects.map(p => (
              <div
                key={p.id}
                onClick={() => setSelected(p.id)}
                className={`cursor-pointer rounded-xl border p-4 transition-colors ${
                  selected === p.id ? 'border-primary bg-primary/5' : 'border-border bg-card hover:border-primary/30'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-semibold text-sm truncate">{p.name}</h3>
                  <div className="flex items-center gap-1.5">
                    {(p.blockers?.length ?? 0) > 0 && (
                      <span className="flex items-center gap-0.5 text-amber-400" title={`${p.blockers!.length} blocker(s) need your input`}>
                        <AlertTriangle className="w-3.5 h-3.5" />
                      </span>
                    )}
                    <Badge variant={statusVariant[p.status] ?? 'muted'}>{p.status}</Badge>
                  </div>
                </div>
                <PhaseProgress current={p.currentPhase ?? 1} total={p.totalPhases ?? 5} phases={p.phases} />
                <div className="flex items-center justify-between mt-2">
                  <span className="text-xs text-muted-foreground">{formatNumber(p.tokensUsed ?? 0)} {t('common.tokens')}</span>
                  {(p.assignedAgents?.length ?? 0) > 0 && (
                    <div className="flex gap-0.5">
                      {p.assignedAgents!.slice(0, 4).map(id => (
                        <span key={id} className="text-xs">{ROLE_EMOJI[id] ?? '🤖'}</span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Project detail */}
          <div className="lg:col-span-2">
            {selectedProject ? (
              <ProjectDetail
                project={selectedProject}
                onDelete={() => handleDelete(selectedProject.id)}
                deleting={deleting}
              />
            ) : (
              <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">
                {t('common.selectProject')}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Create dialog */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle className="text-base">{t('projects.createProject')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm font-medium">{t('projects.projectName')}</label>
                <input
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleCreate()}
                  autoFocus
                  className="w-full mt-1.5 px-3 py-2 text-sm bg-muted/30 border border-border rounded-lg focus:outline-none focus:border-primary"
                  placeholder="e.g. E-commerce Platform"
                />
              </div>
              <div>
                <label className="text-sm font-medium">{t('projects.projectDesc')}</label>
                <textarea
                  value={newDesc}
                  onChange={e => setNewDesc(e.target.value)}
                  rows={3}
                  className="w-full mt-1.5 px-3 py-2 text-sm bg-muted/30 border border-border rounded-lg focus:outline-none focus:border-primary resize-none"
                />
              </div>
              {/* Department selector */}
              <div>
                <label className="text-sm font-medium">{t('projects.department')}</label>
                <select
                  value={newDept}
                  onChange={e => setNewDept(e.target.value)}
                  className="w-full mt-1.5 px-3 py-2 text-sm bg-muted/30 border border-border rounded-lg focus:outline-none focus:border-primary"
                >
                  <option value="">{t('projects.noDepartment')}</option>
                  {departments.map(d => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  onClick={() => { setShowCreate(false); setNewName(''); setNewDesc(''); setNewDept('') }}
                  className="flex-1 px-4 py-2 text-sm border border-border rounded-lg text-muted-foreground hover:text-foreground transition-colors"
                >
                  {t('common.cancel')}
                </button>
                <button
                  onClick={handleCreate}
                  disabled={!newName.trim() || creating}
                  className="flex-1 px-4 py-2 text-sm bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors"
                >
                  {creating
                    ? <span className="flex items-center justify-center gap-1"><Loader2 className="w-3.5 h-3.5 animate-spin" />{t('common.saving')}</span>
                    : t('projects.createProject')}
                </button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
