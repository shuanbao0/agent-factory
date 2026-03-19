'use client'
import { cn } from '@/lib/utils'
import { HTMLAttributes } from 'react'

const variants: Record<string, string> = {
  default: 'bg-primary/20 text-primary',
  success: 'bg-emerald-500/20 text-emerald-400',
  warning: 'bg-amber-500/20 text-amber-400',
  danger: 'bg-red-500/20 text-red-400',
  muted: 'bg-muted text-muted-foreground',
}

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: keyof typeof variants
}

export function Badge({ className, variant = 'default', ...props }: BadgeProps) {
  return (
    <span className={cn('inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium', variants[variant], className)} {...props} />
  )
}
