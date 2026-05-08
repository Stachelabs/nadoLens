'use client'

import { Spinner } from '@/components/ui/Spinner'

interface Props {
  text: string
  height?: string
}

export function LoadingShimmer({ text, height = 'h-80' }: Props) {
  return (
    <div role="status" aria-label="Loading" className={`flex ${height} items-center justify-center gap-2.5`}>
      <Spinner size={15} />
      <span
        style={{
          background:
            'linear-gradient(90deg, var(--muted-foreground) 20%, var(--foreground) 50%, var(--muted-foreground) 80%)',
          backgroundSize: '200% 100%',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text',
          animation: 'shimmer-text 2s linear infinite',
        }}
        className="text-xs font-medium"
      >
        {text}
      </span>
    </div>
  )
}
