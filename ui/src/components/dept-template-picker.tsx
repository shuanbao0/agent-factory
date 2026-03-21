'use client'
import { useState, useEffect } from 'react'
import { useTranslation } from '@/lib/i18n'
import { Plus, X, Users } from 'lucide-react'
import type { DepartmentTemplate } from '@/lib/types'

interface DeptTemplatePickerProps {
  onSelect: (template: DepartmentTemplate | null) => void
  onClose: () => void
}

export function DeptTemplatePicker({ onSelect, onClose }: DeptTemplatePickerProps) {
  const { t, locale } = useTranslation()
  const [templates, setTemplates] = useState<DepartmentTemplate[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/dept-templates')
      .then(r => r.json())
      .then(data => setTemplates(data.templates || []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-card border border-border rounded-xl p-6 w-full max-w-2xl max-h-[85vh] overflow-y-auto space-y-4"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-lg">{t('deptTemplates.title')}</h3>
          <button onClick={onClose} className="p-1 text-muted-foreground hover:text-foreground">
            <X className="w-5 h-5" />
          </button>
        </div>

        {loading ? (
          <div className="text-center py-8 text-muted-foreground text-sm">Loading...</div>
        ) : (
          <>
            {/* Template grid */}
            <div className="grid grid-cols-2 gap-2">
              {templates.map(tmpl => (
                <button
                  key={tmpl.id}
                  onClick={() => onSelect(tmpl)}
                  className="flex items-start gap-3 p-3 rounded-lg border border-border hover:border-primary/50 hover:bg-primary/5 transition-colors text-left"
                >
                  <span className="text-2xl shrink-0 mt-0.5">{tmpl.emoji}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-medium truncate">
                        {locale === 'zh' ? tmpl.name : tmpl.nameEn}
                      </span>
                    </div>
                    <span className="text-[10px] text-muted-foreground block truncate">
                      {locale === 'zh' ? tmpl.description : tmpl.descriptionEn}
                    </span>
                    {tmpl.recommendedAgents.length > 0 && (
                      <span className="inline-flex items-center gap-1 mt-1 text-[10px] text-muted-foreground bg-muted/50 rounded-full px-1.5 py-0.5">
                        <Users className="w-3 h-3" />
                        {tmpl.recommendedAgents.length} agents
                      </span>
                    )}
                  </div>
                </button>
              ))}
            </div>

            {/* Blank option */}
            <button
              onClick={() => onSelect(null)}
              className="flex flex-col items-center gap-1.5 p-3 rounded-lg border border-dashed border-border hover:border-primary/50 hover:bg-primary/5 transition-colors w-full"
            >
              <Plus className="w-6 h-6 text-muted-foreground" />
              <span className="text-xs font-medium">{t('deptTemplates.blankDept')}</span>
              <span className="text-[10px] text-muted-foreground">{t('deptTemplates.blankDeptDesc')}</span>
            </button>
          </>
        )}
      </div>
    </div>
  )
}
