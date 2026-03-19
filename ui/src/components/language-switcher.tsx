'use client'
import { useTranslation, Locale } from '@/lib/i18n'
import { Globe } from 'lucide-react'

export function LanguageSwitcher() {
  const { t, locale, setLocale } = useTranslation()
  return (
    <button
      onClick={() => setLocale(locale === 'zh' ? 'en' : 'zh')}
      className="flex items-center gap-1.5 px-2 py-1 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
      title={t('common.switchLanguage')}
    >
      <Globe className="w-3.5 h-3.5" />
      <span>{locale === 'zh' ? 'EN' : '中文'}</span>
    </button>
  )
}
