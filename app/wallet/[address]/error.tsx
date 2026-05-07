'use client'

import { useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import Link from 'next/link'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('Wallet error:', error.message)
  }, [error])

  return (
    <div className="flex items-center justify-center min-h-[calc(100vh-80px)] bg-background">
      <div className="max-w-md w-full space-y-4 text-center p-6 bg-card rounded-lg border border-border">
        <h1 className="text-2xl font-bold text-foreground">Failed to load wallet</h1>
        <p className="text-sm text-muted-foreground">
          We couldn't load your wallet data. Please check the address and try again.
        </p>
        {error.digest && (
          <p className="text-xs text-destructive font-mono">
            Error ID: {error.digest}
          </p>
        )}
        <div className="flex gap-2 pt-2">
          <Button onClick={reset} className="flex-1">
            Retry
          </Button>
          <Link href="/wallet" className={cn(buttonVariants({ variant: "outline" }), "w-full flex-1")}>
            Go back
          </Link>
        </div>
      </div>
    </div>
  )
}
