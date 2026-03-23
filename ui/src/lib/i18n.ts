import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { useState, useEffect, useCallback } from 'react'
import zh from '@/locales/zh.json'
import en from '@/locales/en.json'

export type Locale = 'zh' | 'en'

type TranslationValue = string | { [key: string]: TranslationValue }

const messages: Record<Locale, typeof zh> = { zh, en }

interface I18nState {
  locale: Locale
  setLocale: (l: Locale) => void
}

export const useI18nStore = create<I18nState>()(
  persist(
    (set) => ({
      locale: 'zh',
      setLocale: (locale) => set({ locale }),
    }),
    { name: 'af-locale', skipHydration: true }
  )
)

export function useTranslation() {
  const { locale, setLocale } = useI18nStore()
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    useI18nStore.persist.rehydrate()
    setHydrated(true)
  }, [])

  const activeLocale = hydrated ? locale : 'zh'

  const t = useCallback((key: string): string => {
    const keys = key.split('.')
    let val: TranslationValue | undefined = messages[activeLocale]
    for (const k of keys) {
      if (val && typeof val === 'object') {
        val = (val as Record<string, TranslationValue>)[k]
      } else {
        val = undefined
        break
      }
    }
    return typeof val === 'string' ? val : key
  }, [activeLocale])

  return { t, locale: activeLocale, setLocale }
}
