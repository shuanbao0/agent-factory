'use client'
import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslation } from '@/lib/i18n'
import { useAppStore } from '@/lib/store'
import type { Agent } from '@/lib/types'
import { ZoomIn, ZoomOut, Maximize2, Monitor } from 'lucide-react'
import { usePixelOffice } from './usePixelOffice'
import { PixelOfficeCanvas } from './PixelOfficeCanvas'
import { AgentTooltip } from './AgentTooltip'
import { ZOOM_MIN, ZOOM_MAX } from './pixel-constants'
import type { CharacterState } from './pixel-types'

interface PixelOfficeViewProps {
  isVisible: boolean
}

export function PixelOfficeView({ isVisible }: PixelOfficeViewProps) {
  const { t } = useTranslation()
  const router = useRouter()
  const agents = useAppStore((s) => s.agents)
  const pixelOffice = usePixelOffice()
  const [zoom, setZoom] = useState(3)
  const [tooltip, setTooltip] = useState<{
    agent: Agent | undefined
    screenX: number
    screenY: number
    visible: boolean
    characterState?: CharacterState
  }>({ agent: undefined, screenX: 0, screenY: 0, visible: false })

  const handleCharacterClick = useCallback(
    (numericId: number) => {
      if (!pixelOffice) return
      const agent = pixelOffice.getAgentByNumericId(numericId)
      if (agent) {
        router.push(`/agents/${agent.id}`)
      }
    },
    [pixelOffice, router],
  )

  const handleCharacterHover = useCallback(
    (numericId: number | null, screenX: number, screenY: number) => {
      if (!pixelOffice || numericId === null) {
        setTooltip((prev) => ({ ...prev, visible: false }))
        return
      }
      const agent = pixelOffice.getAgentByNumericId(numericId)
      const ch = pixelOffice.officeState.characters.get(numericId)
      setTooltip({ agent, screenX, screenY, visible: true, characterState: ch?.state })
    },
    [pixelOffice],
  )

  const handleZoomIn = useCallback(() => {
    setZoom((z) => Math.min(ZOOM_MAX, z + 1))
  }, [])

  const handleZoomOut = useCallback(() => {
    setZoom((z) => Math.max(ZOOM_MIN, z - 1))
  }, [])

  const handleResetZoom = useCallback(() => {
    setZoom(3)
  }, [])

  if (agents.length === 0) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        <Monitor className="w-12 h-12 mx-auto mb-3 opacity-30" />
        <p>{t('agents.pixelOfficeEmpty')}</p>
        <p className="text-xs mt-1">{t('agents.pixelOfficeHint')}</p>
      </div>
    )
  }

  if (!pixelOffice) return null

  return (
    <div className="flex flex-col gap-3" style={{ height: 'calc(100vh - 220px)', minHeight: 400 }}>
      {/* Toolbar */}
      <div className="flex items-center gap-2 flex-shrink-0">
        <button
          onClick={handleZoomOut}
          className="p-1.5 rounded-md border border-border hover:bg-muted transition-colors"
          title={t('pixelOffice.zoomOut')}
        >
          <ZoomOut className="w-4 h-4" />
        </button>
        <span className="text-xs text-muted-foreground min-w-[3ch] text-center">{zoom}x</span>
        <button
          onClick={handleZoomIn}
          className="p-1.5 rounded-md border border-border hover:bg-muted transition-colors"
          title={t('pixelOffice.zoomIn')}
        >
          <ZoomIn className="w-4 h-4" />
        </button>
        <button
          onClick={handleResetZoom}
          className="p-1.5 rounded-md border border-border hover:bg-muted transition-colors"
          title={t('pixelOffice.resetView')}
        >
          <Maximize2 className="w-4 h-4" />
        </button>
      </div>

      {/* Canvas container */}
      <div className="relative flex-1 min-h-0">
        <PixelOfficeCanvas
          officeState={pixelOffice.officeState}
          onCharacterClick={handleCharacterClick}
          onCharacterHover={handleCharacterHover}
          zoom={zoom}
          onZoomChange={setZoom}
          isVisible={isVisible}
          collaborationLinks={pixelOffice.collaborationLinks}
        />
        <AgentTooltip
          agent={tooltip.agent}
          screenX={tooltip.screenX}
          screenY={tooltip.screenY}
          visible={tooltip.visible}
          characterState={tooltip.characterState}
        />
      </div>
    </div>
  )
}
