import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import '@/styles/globals.css'
import { Sidebar } from '@/components/sidebar'
import { ClientOnly } from '@/components/client-only'
import { DataProvider } from '@/components/data-provider'
import { GatewayGuard } from '@/components/gateway-guard'
import { LayoutShell } from '@/components/layout-shell'
import { ErrorBoundary } from '@/components/error-boundary'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Agent Factory — Dashboard',
  description: 'AI Employee Factory Management Dashboard',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body className={inter.className} suppressHydrationWarning>
        <ClientOnly>
          <ErrorBoundary>
            <GatewayGuard>
              <LayoutShell>
                {children}
              </LayoutShell>
            </GatewayGuard>
          </ErrorBoundary>
        </ClientOnly>
      </body>
    </html>
  )
}
