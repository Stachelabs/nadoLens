"use client"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"

interface ErrorBannerProps {
  error: string
}

export function ErrorBanner({ error }: ErrorBannerProps) {
  return (
    <Card className="border-destructive/40 bg-destructive/5 p-0">
      <CardContent className="flex items-center justify-between gap-3 p-4">
        <p className="text-sm text-foreground">
          Data is temporarily unavailable ({error}).
        </p>
        <Button
          size="sm"
          variant="outline"
          onClick={() => window.location.reload()}
        >
          Reload
        </Button>
      </CardContent>
    </Card>
  )
}
