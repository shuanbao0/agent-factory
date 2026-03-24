'use client'

import { useState } from 'react'
import { useTranslation } from '@/lib/i18n'
import { ChevronDown, ChevronRight } from 'lucide-react'

type UiHint = {
  label?: string
  help?: string
  sensitive?: boolean
  placeholder?: string
  advanced?: boolean
}

type JsonSchema = {
  type?: string | string[]
  properties?: Record<string, JsonSchema>
  enum?: string[]
  additionalProperties?: boolean | JsonSchema
  required?: string[]
  minimum?: number
  maximum?: number
}

interface PluginConfigFormProps {
  schema: JsonSchema
  uiHints: Record<string, UiHint> | null
  values: Record<string, unknown>
  onChange: (values: Record<string, unknown>) => void
}

/** Get nested value by dot-path */
function getByPath(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split('.')
  let cur: unknown = obj
  for (const p of parts) {
    if (cur == null || typeof cur !== 'object') return undefined
    cur = (cur as Record<string, unknown>)[p]
  }
  return cur
}

/** Set nested value by dot-path, returns new object */
function setByPath(obj: Record<string, unknown>, path: string, value: unknown): Record<string, unknown> {
  const result = { ...obj }
  const parts = path.split('.')
  if (parts.length === 1) {
    result[parts[0]] = value
    return result
  }
  const [head, ...rest] = parts
  const child = (result[head] && typeof result[head] === 'object') ? { ...(result[head] as Record<string, unknown>) } : {}
  result[head] = setByPath(child, rest.join('.'), value)
  return result
}

/** Flatten JSON Schema properties to dot-path field descriptors */
function flattenSchema(schema: JsonSchema, prefix = ''): Array<{
  path: string
  type: string
  enumValues?: string[]
  required: boolean
}> {
  const fields: Array<{ path: string; type: string; enumValues?: string[]; required: boolean }> = []
  const props = schema.properties || {}
  const requiredSet = new Set(schema.required || [])

  for (const [key, sub] of Object.entries(props)) {
    const path = prefix ? `${prefix}.${key}` : key
    const rawType = Array.isArray(sub.type) ? sub.type[0] : (sub.type || 'string')

    if (rawType === 'object' && sub.properties && !sub.additionalProperties) {
      fields.push(...flattenSchema(sub, path))
    } else {
      fields.push({
        path,
        type: rawType,
        enumValues: sub.enum,
        required: requiredSet.has(key),
      })
    }
  }
  return fields
}

export default function PluginConfigForm({ schema, uiHints, values, onChange }: PluginConfigFormProps) {
  const { t } = useTranslation()
  const [showAdvanced, setShowAdvanced] = useState(false)

  const fields = flattenSchema(schema)
  const hints = uiHints || {}

  const basicFields = fields.filter(f => !hints[f.path]?.advanced)
  const advancedFields = fields.filter(f => hints[f.path]?.advanced)

  function handleChange(path: string, value: unknown) {
    onChange(setByPath(values, path, value))
  }

  function renderField(field: { path: string; type: string; enumValues?: string[]; required: boolean }) {
    const hint = hints[field.path] || {}
    const label = hint.label || field.path.split('.').pop() || field.path
    const currentValue = getByPath(values, field.path)

    // Boolean toggle
    if (field.type === 'boolean') {
      return (
        <div key={field.path} className="flex items-center justify-between py-1.5">
          <div>
            <span className="text-sm">{label}</span>
            {hint.help && <p className="text-xs text-muted-foreground mt-0.5">{hint.help}</p>}
          </div>
          <button
            type="button"
            onClick={() => handleChange(field.path, !currentValue)}
            className={`relative w-9 h-5 rounded-full transition-colors ${currentValue ? 'bg-primary' : 'bg-muted'}`}
          >
            <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${currentValue ? 'translate-x-4' : ''}`} />
          </button>
        </div>
      )
    }

    // Enum select
    if (field.enumValues) {
      return (
        <div key={field.path} className="space-y-1">
          <label className="text-sm">{label}{field.required && <span className="text-red-400 ml-1">*</span>}</label>
          {hint.help && <p className="text-xs text-muted-foreground">{hint.help}</p>}
          <select
            value={String(currentValue || '')}
            onChange={e => handleChange(field.path, e.target.value)}
            className="w-full px-3 py-1.5 text-sm bg-muted border border-border rounded-md focus:ring-2 focus:ring-primary/50 focus:outline-none"
          >
            <option value="">--</option>
            {field.enumValues.map(v => <option key={v} value={v}>{v}</option>)}
          </select>
        </div>
      )
    }

    // Number input
    if (field.type === 'number') {
      return (
        <div key={field.path} className="space-y-1">
          <label className="text-sm">{label}{field.required && <span className="text-red-400 ml-1">*</span>}</label>
          {hint.help && <p className="text-xs text-muted-foreground">{hint.help}</p>}
          <input
            type="number"
            value={currentValue != null ? String(currentValue) : ''}
            placeholder={hint.placeholder}
            onChange={e => handleChange(field.path, e.target.value ? Number(e.target.value) : undefined)}
            className="w-full px-3 py-1.5 text-sm bg-muted border border-border rounded-md font-mono focus:ring-2 focus:ring-primary/50 focus:outline-none"
          />
        </div>
      )
    }

    // String (default) — text or password
    return (
      <div key={field.path} className="space-y-1">
        <label className="text-sm">{label}{field.required && <span className="text-red-400 ml-1">*</span>}</label>
        {hint.help && <p className="text-xs text-muted-foreground">{hint.help}</p>}
        <input
          type={hint.sensitive ? 'password' : 'text'}
          value={String(currentValue || '')}
          placeholder={hint.placeholder}
          onChange={e => handleChange(field.path, e.target.value || undefined)}
          className="w-full px-3 py-1.5 text-sm bg-muted border border-border rounded-md font-mono focus:ring-2 focus:ring-primary/50 focus:outline-none"
        />
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {basicFields.map(renderField)}
      {advancedFields.length > 0 && (
        <>
          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {showAdvanced ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
            {showAdvanced ? t('settings.pluginHideAdvanced') : t('settings.pluginShowAdvanced')}
          </button>
          {showAdvanced && (
            <div className="space-y-3 pl-2 border-l-2 border-border/50">
              {advancedFields.map(renderField)}
            </div>
          )}
        </>
      )}
    </div>
  )
}
