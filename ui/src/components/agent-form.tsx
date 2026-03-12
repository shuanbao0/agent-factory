'use client'
import { useState } from 'react'
import { useTranslation } from '@/lib/i18n'
import { useAppStore, type ModelInfo } from '@/lib/store'
import { AgentTemplate } from '@/lib/types'
import { TemplatePicker } from './template-picker'
import { X, Loader2, ChevronLeft, ChevronDown, ChevronUp } from 'lucide-react'

interface AgentFormProps {
  /** If provided, we're editing an existing agent */
  editAgent?: {
    id: string
    role: string
    name: string
    description: string
    model?: string
    templateId?: string | null
    skills?: string[]
    peers?: string[]
    department?: string
  }
  onClose: () => void
  onSaved: (createdAgentId?: string, skipAutoInit?: boolean) => void
}

export function AgentForm({ editAgent, onClose, onSaved }: AgentFormProps) {
  const { t, locale } = useTranslation()
  const modelsList = useAppStore(s => s.modelsList)
  const defaultModel = useAppStore(s => s.defaultModel)
  const templates = useAppStore(s => s.templates)
  const agents = useAppStore(s => s.agents)
  const departments = useAppStore(s => s.departments)
  const isEdit = !!editAgent

  // Step: 'pick-template' or 'configure'
  const [step, setStep] = useState<'pick-template' | 'configure'>(isEdit ? 'configure' : 'pick-template')
  const [selectedTemplate, setSelectedTemplate] = useState<AgentTemplate | null>(null)

  const [department, setDepartment] = useState(editAgent?.department || '')
  const [id, setId] = useState(editAgent?.id || '')
  const [name, setName] = useState(editAgent?.name || '')
  const [description, setDescription] = useState(editAgent?.description || '')
  const [model, setModel] = useState(editAgent?.model || '')
  const [skills, setSkills] = useState<string[]>(editAgent?.skills || [])
  const [peers, setPeers] = useState<string[]>(editAgent?.peers || [])
  const [showSystemPrompt, setShowSystemPrompt] = useState(false)
  const [systemPrompt, setSystemPrompt] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Available skills — gathered from all templates defaults
  const allSkills = Array.from(new Set(
    templates.flatMap(t => t.defaults.skills)
  )).sort()

  const handleTemplateSelect = (template: AgentTemplate | null) => {
    setSelectedTemplate(template)
    if (template) {
      setName(template.name)
      setDescription(template.description)
      setModel(template.defaults.model)
      setSkills([...template.defaults.skills])
      setPeers([...template.defaults.peers])
      setId(template.id)
      setDepartment(template.group || '')
    }
    setStep('configure')
  }

  const handleSkillToggle = (skill: string) => {
    setSkills(prev =>
      prev.includes(skill) ? prev.filter(s => s !== skill) : [...prev, skill]
    )
  }

  const handlePeerToggle = (peerId: string) => {
    setPeers(prev =>
      prev.includes(peerId) ? prev.filter(p => p !== peerId) : [...prev, peerId]
    )
  }

  const handleSave = async () => {
    if (!id.trim()) { setError(t('agents.idRequired')); return }
    if (!name.trim()) { setError(t('agents.nameRequired')); return }

    setSaving(true)
    setError('')

    try {
      const method = isEdit ? 'PUT' : 'POST'
      const payload: Record<string, unknown> = {
        id: id.trim(),
        name: name.trim(),
        description: description.trim(),
        model: model || undefined,
        skills,
        peers,
      }
      if (department) payload.department = department
      if (!isEdit && selectedTemplate) {
        payload.templateId = selectedTemplate.id
      }
      if (systemPrompt.trim()) {
        payload.systemPrompt = systemPrompt.trim()
      }

      const res = await fetch('/api/agents', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Failed to save')
      }

      onSaved(isEdit ? undefined : id.trim(), data.hasIdentityFiles === true)
      onClose()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-card border border-border rounded-xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto space-y-4"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {step === 'configure' && !isEdit && (
              <button
                onClick={() => setStep('pick-template')}
                className="p-1 text-muted-foreground hover:text-foreground"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
            )}
            <h3 className="font-semibold text-lg">
              {step === 'pick-template'
                ? t('templates.pickTemplate')
                : isEdit ? t('agents.editAgent') : t('agents.createAgent')
              }
            </h3>
            {step === 'configure' && selectedTemplate && (
              <span className="text-sm text-muted-foreground">
                {selectedTemplate.emoji} {selectedTemplate.name}
              </span>
            )}
          </div>
          <button onClick={onClose} className="p-1 text-muted-foreground hover:text-foreground">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Step 1: Template Picker */}
        {step === 'pick-template' && (
          <TemplatePicker templates={templates} onSelect={handleTemplateSelect} />
        )}

        {/* Step 2: Configuration Form */}
        {step === 'configure' && (
          <div className="space-y-4">
            {/* ID */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium">ID</label>
              <input
                type="text"
                value={id}
                onChange={e => setId(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                disabled={isEdit}
                placeholder="e.g. pm-alpha, frontend-main"
                className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:opacity-60 font-mono"
              />
            </div>

            {/* Name */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium">{t('agents.agentName')}</label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="e.g. Project Manager Alpha"
                className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>

            {/* Description */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium">{t('agents.description')}</label>
              <textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                rows={2}
                placeholder={t('agents.descriptionPlaceholder')}
                className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
              />
            </div>

            {/* Department */}
            {departments.length > 0 && (
              <div className="space-y-1.5">
                <label className="text-sm font-medium">{t('agents.department')}</label>
                <select
                  value={department}
                  onChange={e => setDepartment(e.target.value)}
                  className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                >
                  <option value="">{t('agents.noDepartment')}</option>
                  {departments.map(d => (
                    <option key={d.id} value={d.id}>
                      {d.emoji} {locale === 'zh' ? d.name : d.nameEn}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Model */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium">{t('agents.assignedModel')}</label>
              <select
                value={model}
                onChange={e => setModel(e.target.value)}
                className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
              >
                <option value="">Default ({defaultModel})</option>
                {modelsList.map(m => (
                  <option key={m.ref} value={m.ref}>
                    {m.ref} → {m.modelId}
                  </option>
                ))}
              </select>
            </div>

            {/* Skills */}
            {allSkills.length > 0 && (
              <div className="space-y-1.5">
                <label className="text-sm font-medium">{t('agents.skills')}</label>
                <div className="flex flex-wrap gap-2">
                  {allSkills.map(skill => (
                    <button
                      key={skill}
                      onClick={() => handleSkillToggle(skill)}
                      className={`px-2.5 py-1 text-xs rounded-full border transition-colors ${
                        skills.includes(skill)
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-border text-muted-foreground hover:border-primary/30'
                      }`}
                    >
                      {skill}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Peers */}
            {agents.length > 0 && (
              <div className="space-y-1.5">
                <label className="text-sm font-medium">{t('agents.peers')}</label>
                <div className="flex flex-wrap gap-2">
                  {agents.filter(a => a.id !== id).map(a => (
                    <button
                      key={a.id}
                      onClick={() => handlePeerToggle(a.id)}
                      className={`px-2.5 py-1 text-xs rounded-full border transition-colors ${
                        peers.includes(a.id)
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-border text-muted-foreground hover:border-primary/30'
                      }`}
                    >
                      {a.name || a.id}
                    </button>
                  ))}
                  {/* Also show template default peers that might not be instantiated yet */}
                  {selectedTemplate && selectedTemplate.defaults.peers
                    .filter(p => !agents.find(a => a.id === p) && p !== id)
                    .map(p => (
                      <button
                        key={p}
                        onClick={() => handlePeerToggle(p)}
                        className={`px-2.5 py-1 text-xs rounded-full border transition-colors opacity-60 ${
                          peers.includes(p)
                            ? 'border-primary bg-primary/10 text-primary'
                            : 'border-border text-muted-foreground hover:border-primary/30'
                        }`}
                      >
                        {p} (template)
                      </button>
                    ))
                  }
                </div>
              </div>
            )}

            {/* System Prompt (collapsible) */}
            <div className="space-y-1.5">
              <button
                onClick={() => setShowSystemPrompt(!showSystemPrompt)}
                className="flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground"
              >
                {showSystemPrompt ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                {t('templates.systemPrompt')}
              </button>
              {showSystemPrompt && (
                <textarea
                  value={systemPrompt}
                  onChange={e => setSystemPrompt(e.target.value)}
                  rows={8}
                  placeholder={t('templates.systemPromptPlaceholder')}
                  className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 resize-y font-mono"
                />
              )}
            </div>

            {/* Error */}
            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}

            {/* Actions */}
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={onClose}
                className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-muted">
                {t('common.cancel')}
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !id.trim() || !name.trim()}
                className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 flex items-center gap-1.5"
              >
                {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                {saving ? t('common.saving') : isEdit ? t('common.save') : t('agents.createAgent')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
