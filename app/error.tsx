'use client'

import { useEffect } from 'react'
import { Button } from '@/components/ui/button'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('Root error:', error.message)
  }, [error])

  return (
    <div className="flex items-center justify-center min-h-screen bg-background">
      <div className="max-w-md w-full space-y-4 text-center p-6 bg-card rounded-lg border border-border">
        <h1 className="text-2xl font-bold text-foreground">Something went wrong</h1>
        <p className="text-sm text-muted-foreground">
          An unexpected error occurred. Please try again.
        </p>
        {error.digest && (
          <p className="text-xs text-destructive font-mono">
            Error ID: {error.digest}
          </p>
        )}
        <Button onClick={reset} className="w-full">
          Try again
        </Button>
      </div>
    </div>
  )
}
