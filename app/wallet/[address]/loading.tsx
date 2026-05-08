import { Skeleton } from "@/components/ui/skeleton"
import { Card, CardContent } from "@/components/ui/card"

export default function WalletLoading() {
  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-8">
      <Card className="border-border bg-card">
        <CardContent className="flex items-center gap-4 p-5">
          <Skeleton className="h-10 w-10 rounded-full" />
          <div className="space-y-2">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-7 w-28" />
          </div>
        </CardContent>
      </Card>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <Card key={i} className="border-border bg-card">
            <CardContent className="space-y-2 p-4">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-6 w-20" />
            </CardContent>
          </Card>
        ))}
      </div>
      <Skeleton className="h-10 w-full max-w-sm" />
      <Card className="border-border bg-card">
        <CardContent className="space-y-3 p-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
