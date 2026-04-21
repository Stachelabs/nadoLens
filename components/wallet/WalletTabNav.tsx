'use client'

import { cn } from '@/lib/utils'

type Tab = 'trading' | 'analytics'

interface Props {
  activeTab: Tab
  onTabChange: (tab: Tab) => void
}

const TABS: { value: Tab; label: string }[] = [
  { value: 'trading', label: 'Trading' },
  { value: 'analytics', label: 'Analytics' },
]

export function WalletTabNav({ activeTab, onTabChange }: Props) {
  return (
    <div className="border-b border-border">
      <div className="flex">
        {TABS.map((tab) => (
          <button
            key={tab.value}
            type="button"
            onClick={() => onTabChange(tab.value)}
            className={cn(
              'px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px',
              activeTab === tab.value
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>
    </div>
  )
}
