'use client'

import { useTheme } from 'next-themes'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'

function SunIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
    </svg>
  )
}

function MoonIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  )
}

function SystemIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="3" width="20" height="14" rx="2" />
      <path d="M8 21h8M12 17v4" />
    </svg>
  )
}

const themes = [
  { value: 'light', icon: SunIcon, label: 'Light' },
  { value: 'dark', icon: MoonIcon, label: 'Dark' },
  { value: 'system', icon: SystemIcon, label: 'System' },
] as const

export function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])

  if (!mounted) {
    return <div className="h-7 w-[88px] rounded-md bg-muted animate-pulse" />
  }

  return (
    <div className="flex items-center rounded-md border border-border bg-muted/40 p-0.5 gap-0.5">
      {themes.map(({ value, icon: Icon, label }) => (
        <Button
          key={value}
          variant="ghost"
          size="sm"
          onClick={() => setTheme(value)}
          title={label}
          className={
            theme === value
              ? 'h-6 w-6 p-0 bg-background text-foreground shadow-sm hover:bg-background hover:text-foreground'
              : 'h-6 w-6 p-0 text-muted-foreground hover:text-foreground hover:bg-transparent'
          }
        >
          <Icon />
        </Button>
      ))}
    </div>
  )
}
