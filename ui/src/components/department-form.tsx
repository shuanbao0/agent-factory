'use client'
import { useState } from 'react'
import { useTranslation } from '@/lib/i18n'
import { Department, DepartmentFurnitureItem, DepartmentTemplate } from '@/lib/types'
import { X, Loader2, Plus, Minus } from 'lucide-react'

const FURNITURE_TYPES = [
  { type: 'desk', label: 'Desk', labelZh: '办公桌' },
  { type: 'bookshelf', label: 'Bookshelf', labelZh: '书架' },
  { type: 'plant', label: 'Plant', labelZh: '绿植' },
  { type: 'cooler', label: 'Cooler', labelZh: '饮水机' },
  { type: 'whiteboard', label: 'Whiteboard', labelZh: '白板' },
  { type: 'lamp', label: 'Lamp', labelZh: '台灯' },
  { type: 'meeting_table', label: 'Meeting Table', labelZh: '会议桌' },
]

interface DepartmentFormProps {
  editDept?: Department
  template?: DepartmentTemplate | null
  onClose: () => void
  onSaved: () => void
}

export function DepartmentForm({ editDept, template, onClose, onSaved }: DepartmentFormProps) {
  const { t, locale } = useTranslation()
  const isEdit = !!editDept
  const tmplDefaults = template?.defaults

  const [id, setId] = useState(editDept?.id || template?.id || '')
  const [name, setName] = useState(editDept?.name || template?.name || '')
  const [nameEn, setNameEn] = useState(editDept?.nameEn || template?.nameEn || '')
  const [emoji, setEmoji] = useState(editDept?.emoji || template?.emoji || '')
  const [order, setOrder] = useState(editDept?.order ?? tmplDefaults?.order ?? 0)
  const [floorH, setFloorH] = useState(editDept?.floorColor?.h ?? tmplDefaults?.floorColor?.h ?? 35)
  const [floorS, setFloorS] = useState(editDept?.floorColor?.s ?? tmplDefaults?.floorColor?.s ?? 30)
  const [floorB, setFloorB] = useState(editDept?.floorColor?.b ?? tmplDefaults?.floorColor?.b ?? 15)
  const [furniture, setFurniture] = useState<DepartmentFurnitureItem[]>(
    editDept?.furniture || tmplDefaults?.furniture || [{ type: 'desk', count: 4 }]
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const updateFurnitureCount = (index: number, delta: number) => {
    setFurniture(prev => prev.map((item, i) =>
      i === index ? { ...item, count: Math.max(0, Math.min(10, item.count + delta)) } : item
    ))
  }

  const addFurnitureType = (type: string) => {
    if (furniture.find(f => f.type === type)) return
    setFurniture(prev => [...prev, { type, count: 1 }])
  }

  const removeFurnitureItem = (index: number) => {
    setFurniture(prev => prev.filter((_, i) => i !== index))
  }

  const handleSave = async () => {
    if (!id.trim()) { setError(t('agents.idRequired')); return }
    if (!name.trim() || !nameEn.trim()) { setError(t('agents.nameRequired')); return }

    setSaving(true)
    setError('')

    try {
      const method = isEdit ? 'PUT' : 'POST'
      const payload: Record<string, unknown> = {
        id: id.trim(),
        name: name.trim(),
        nameEn: nameEn.trim(),
        emoji: emoji || '🏢',
        order,
        floorColor: { h: floorH, s: floorS, b: floorB, c: 0 },
        furniture: furniture.filter(f => f.count > 0),
      }
      if (!isEdit && template?.id) {
        payload.templateId = template.id
      }

      const res = await fetch('/api/departments', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to save')

      onSaved()
      onClose()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  // Furniture types not yet added
  const availableFurnitureTypes = FURNITURE_TYPES.filter(
    ft => !furniture.find(f => f.type === ft.type)
  )

  // Preview color for floor
  const previewHue = floorH
  const previewSat = Math.max(0, Math.min(100, 50 + floorS))
  const previewLight = Math.max(0, Math.min(100, 30 + floorB))

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-card border border-border rounded-xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto space-y-4"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-lg">
            {isEdit ? t('agents.editDepartment') : t('agents.createDepartment')}
          </h3>
          <button onClick={onClose} className="p-1 text-muted-foreground hover:text-foreground">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* ID */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium">{t('agents.deptId')}</label>
          <input
            type="text"
            value={id}
            onChange={e => setId(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
            disabled={isEdit}
            placeholder="e.g. marketing, qa"
            className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:opacity-60 font-mono"
          />
        </div>

        {/* Name (Chinese) */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium">{t('agents.deptName')}</label>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="e.g. 市场营销部"
            className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
        </div>

        {/* Name (English) */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium">{t('agents.deptNameEn')}</label>
          <input
            type="text"
            value={nameEn}
            onChange={e => setNameEn(e.target.value)}
            placeholder="e.g. Marketing"
            className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
        </div>

        {/* Emoji + Order (side by side) */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">{t('agents.deptEmoji')}</label>
            <input
              type="text"
              value={emoji}
              onChange={e => setEmoji(e.target.value)}
              placeholder="🏢"
              maxLength={4}
              className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 text-center text-lg"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">{t('agents.deptOrder')}</label>
            <input
              type="number"
              value={order}
              onChange={e => setOrder(parseInt(e.target.value) || 0)}
              min={0}
              max={99}
              className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>
        </div>

        {/* Floor Color */}
        <div className="space-y-2">
          <label className="text-sm font-medium flex items-center gap-2">
            {t('agents.deptFloorColor')}
            <span
              className="inline-block w-5 h-5 rounded border border-border"
              style={{ backgroundColor: `hsl(${previewHue}, ${previewSat}%, ${previewLight}%)` }}
            />
          </label>
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground w-6">H</span>
              <input type="range" min={0} max={360} value={floorH} onChange={e => setFloorH(parseInt(e.target.value))}
                className="flex-1 accent-primary" />
              <span className="text-xs text-muted-foreground w-8 text-right">{floorH}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground w-6">S</span>
              <input type="range" min={-50} max={100} value={floorS} onChange={e => setFloorS(parseInt(e.target.value))}
                className="flex-1 accent-primary" />
              <span className="text-xs text-muted-foreground w-8 text-right">{floorS}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground w-6">B</span>
              <input type="range" min={-50} max={50} value={floorB} onChange={e => setFloorB(parseInt(e.target.value))}
                className="flex-1 accent-primary" />
              <span className="text-xs text-muted-foreground w-8 text-right">{floorB}</span>
            </div>
          </div>
        </div>

        {/* Furniture */}
        <div className="space-y-2">
          <label className="text-sm font-medium">{t('agents.deptFurniture')}</label>
          <div className="space-y-2">
            {furniture.map((item, index) => {
              const meta = FURNITURE_TYPES.find(ft => ft.type === item.type)
              return (
                <div key={item.type} className="flex items-center gap-2 bg-muted/30 rounded-lg px-3 py-2">
                  <span className="text-sm flex-1">
                    {locale === 'zh' ? (meta?.labelZh || item.type) : (meta?.label || item.type)}
                  </span>
                  <button
                    onClick={() => updateFurnitureCount(index, -1)}
                    className="p-1 text-muted-foreground hover:text-foreground"
                  >
                    <Minus className="w-3.5 h-3.5" />
                  </button>
                  <span className="text-sm font-mono w-6 text-center">{item.count}</span>
                  <button
                    onClick={() => updateFurnitureCount(index, 1)}
                    className="p-1 text-muted-foreground hover:text-foreground"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => removeFurnitureItem(index)}
                    className="p-1 text-muted-foreground hover:text-red-400"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )
            })}
          </div>
          {availableFurnitureTypes.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {availableFurnitureTypes.map(ft => (
                <button
                  key={ft.type}
                  onClick={() => addFurnitureType(ft.type)}
                  className="px-2 py-1 text-xs rounded-full border border-dashed border-border text-muted-foreground hover:border-primary/50 hover:text-foreground transition-colors"
                >
                  + {locale === 'zh' ? ft.labelZh : ft.label}
                </button>
              ))}
            </div>
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
            disabled={saving || !id.trim() || !name.trim() || !nameEn.trim()}
            className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 flex items-center gap-1.5"
          >
            {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {saving ? t('common.saving') : t('common.save')}
          </button>
        </div>
      </div>
    </div>
  )
}
