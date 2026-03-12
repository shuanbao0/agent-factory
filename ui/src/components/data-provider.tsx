'use client'
import { useEffect, useRef } from 'react'
import { useAppStore } from '@/lib/store'

export function DataProvider({ children }: { children: React.ReactNode }) {
  const connectSSE = useAppStore(s => s.connectSSE)
  const setTabVisible = useAppStore(s => s.setTabVisible)
  const fetchModels = useAppStore(s => s.fetchModels)
  const fetchTemplates = useAppStore(s => s.fetchTemplates)
  const fetchDepartments = useAppStore(s => s.fetchDepartments)
  const fetchAutopilot = useAppStore(s => s.fetchAutopilot)
  const fetchAutopilotDepts = useAppStore(s => s.fetchAutopilotDepts)
  const fetchBudget = useAppStore(s => s.fetchBudget)
  const tabVisible = useAppStore(s => s.tabVisible)

  // Fix 2: use ref so interval callbacks read current value without
  // causing useEffect to tear down / rebuild intervals on tab switch
  const tabVisibleRef = useRef(tabVisible)
  useEffect(() => { tabVisibleRef.current = tabVisible }, [tabVisible])

  // SSE connection
  useEffect(() => {
    const disconnect = connectSSE()
    return disconnect
  }, [connectSSE])

  // One-time data (not pushed via SSE)
  useEffect(() => {
    fetchModels()
    fetchTemplates()
    fetchDepartments()
  }, [fetchModels, fetchTemplates, fetchDepartments])

  // Tab visibility tracking
  useEffect(() => {
    const handler = () => setTabVisible(document.visibilityState === 'visible')
    document.addEventListener('visibilitychange', handler)
    return () => document.removeEventListener('visibilitychange', handler)
  }, [setTabVisible])

  // Autopilot polling — core state every 5s
  useEffect(() => {
    fetchAutopilot()
    const t = setInterval(() => { if (tabVisibleRef.current) fetchAutopilot() }, 5000)
    return () => clearInterval(t)
  }, [fetchAutopilot])

  // Autopilot departments polling — every 10s
  useEffect(() => {
    fetchAutopilotDepts()
    const t = setInterval(() => { if (tabVisibleRef.current) fetchAutopilotDepts() }, 10000)
    return () => clearInterval(t)
  }, [fetchAutopilotDepts])

  // Budget polling — every 15s
  useEffect(() => {
    fetchBudget()
    const t = setInterval(() => { if (tabVisibleRef.current) fetchBudget() }, 15000)
    return () => clearInterval(t)
  }, [fetchBudget])

  return <>{children}</>
}
