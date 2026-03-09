'use client'
import { useEffect, useCallback, type ReactNode } from 'react'

export function Dialog({ open, onClose, children }: {
  open: boolean
  onClose: () => void
  children: ReactNode
}) {
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose()
  }, [onClose])

  useEffect(() => {
    if (open) {
      document.addEventListener('keydown', handleKeyDown)
      document.body.style.overflow = 'hidden'
      return () => {
        document.removeEventListener('keydown', handleKeyDown)
        document.body.style.overflow = ''
      }
    }
  }, [open, handleKeyDown])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      {/* Content */}
      <div
        className="relative max-w-2xl w-full max-h-[85vh] overflow-y-auto bg-card border border-border rounded-lg shadow-xl mx-4"
        onClick={e => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  )
}

export function DialogHeader({ children }: { children: ReactNode }) {
  return (
    <div className="sticky top-0 bg-card border-b border-border px-4 py-3 rounded-t-lg z-10">
      {children}
    </div>
  )
}

export function DialogContent({ children }: { children: ReactNode }) {
  return <div className="px-4 py-3 space-y-3">{children}</div>
}
