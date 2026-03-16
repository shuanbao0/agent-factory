'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { useTranslation } from '@/lib/i18n'
import { LanguageSwitcher } from './language-switcher'
import { useMobile } from '@/hooks/use-mobile'
import {
  LayoutDashboard, Users, FolderKanban, Wrench,
  Settings, ScrollText, Activity, Zap, Menu, X, MessageSquare, CheckSquare, Rocket, DollarSign
} from 'lucide-react'
import { useState, useEffect } from 'react'

const nav = [
  { href: '/', labelKey: 'nav.dashboard', icon: LayoutDashboard },
  { href: '/autopilot', labelKey: 'nav.autopilot', icon: Rocket },
  { href: '/agents', labelKey: 'nav.agents', icon: Users },
  { href: '/projects', labelKey: 'nav.projects', icon: FolderKanban },
  { href: '/tasks', labelKey: 'nav.tasks', icon: CheckSquare },
  { href: '/messages', labelKey: 'nav.messages', icon: MessageSquare },
  { href: '/skills', labelKey: 'nav.skills', icon: Wrench },
  { href: '/costs', labelKey: 'nav.costs', icon: DollarSign },
  { href: '/logs', labelKey: 'nav.logs', icon: ScrollText },
  { href: '/settings', labelKey: 'nav.settings', icon: Settings },
]

export function Sidebar() {
  const pathname = usePathname()
  const { t } = useTranslation()
  const isMobile = useMobile()
  const [open, setOpen] = useState(false)

  // Close sidebar on route change (mobile)
  useEffect(() => {
    setOpen(false)
  }, [pathname])

  // Prevent body scroll when mobile sidebar is open
  useEffect(() => {
    if (isMobile && open) {
      document.body.style.overflow = 'hidden'
      return () => { document.body.style.overflow = '' }
    }
  }, [isMobile, open])

  const sidebarContent = (
    <>
      {/* Logo */}
      <div className="flex items-center justify-between px-6 py-5 border-b border-border">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-primary/20 flex items-center justify-center">
            <Zap className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-base font-bold text-foreground">Agent Factory</h1>
            <p className="text-[10px] text-muted-foreground">{t('common.subtitle')}</p>
          </div>
        </div>
        {isMobile && (
          <button onClick={() => setOpen(false)} className="p-1 text-muted-foreground hover:text-foreground">
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {nav.map(({ href, labelKey, icon: Icon }) => {
          const active = href === '/' ? pathname === '/' : pathname.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              onClick={() => isMobile && setOpen(false)}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                active
                  ? 'bg-primary/15 text-primary'
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent'
              )}
            >
              <Icon className="w-4.5 h-4.5" />
              {t(labelKey)}
            </Link>
          )
        })}
      </nav>

      {/* Footer */}
      <div className="px-4 py-4 border-t border-border space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Activity className="w-3.5 h-3.5" />
            <span>{t('common.systemActive')}</span>
            <span className="ml-auto w-2 h-2 rounded-full bg-emerald-500 animate-pulse-glow" />
          </div>
          <LanguageSwitcher />
        </div>
      </div>
    </>
  )

  // Mobile: overlay sidebar
  if (isMobile) {
    return (
      <>
        {/* Hamburger button */}
        <button
          onClick={() => setOpen(true)}
          className="fixed top-4 left-4 z-50 p-2 rounded-lg bg-card border border-border shadow-lg md:hidden"
        >
          <Menu className="w-5 h-5" />
        </button>

        {/* Overlay */}
        {open && (
          <div className="fixed inset-0 z-50">
            <div className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} />
            <aside className="relative h-full w-64 bg-card border-r border-border flex flex-col shadow-xl">
              {sidebarContent}
            </aside>
          </div>
        )}
      </>
    )
  }

  // Desktop: fixed sidebar
  return (
    <aside className="fixed left-0 top-0 z-40 h-screen w-64 border-r border-border bg-card flex flex-col">
      {sidebarContent}
    </aside>
  )
}
