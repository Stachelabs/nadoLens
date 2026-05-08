import { Skeleton } from "@/components/ui/skeleton"
import { Card, CardContent } from "@/components/ui/card"

const CHART_H = 300

export default function ProtocolLoading() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <Skeleton className="mb-6 h-8 w-52" />

      {/* Tab nav placeholder */}
      <div className="flex gap-6 border-b border-border pb-2">
        {["Overview", "Volumes", "OI, Funding & Liquidations", "Revenue & Users", "TVL & Yield"].map((t) => (
          <Skeleton key={t} className="h-5" style={{ width: t.length * 8 + 16 }} />
        ))}
      </div>

      {/* Timeframe selector */}
      <div className="mt-6 flex items-center gap-3">
        <Skeleton className="h-5 w-20" />
        <Skeleton className="h-8 w-[150px] rounded-md" />
      </div>

      {/* Row 1 — Trading Volume + Open Interest */}
      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="border-border bg-card p-0">
          <CardContent className="p-5">
            <div className="flex gap-10">
              <div>
                <p className="text-xs text-muted-foreground">24h Volume</p>
                <Skeleton className="mt-1 h-7 w-24" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">All Time Volume</p>
                <Skeleton className="mt-1 h-7 w-28" />
              </div>
            </div>
            <div className="my-4 border-t border-border/40" />
            <p className="mb-0.5 text-sm font-medium">Trading Volume</p>
            <p className="mb-3 text-xs text-muted-foreground">The daily trading volume and the cumulative volume.</p>
            <Skeleton className="w-full" style={{ height: CHART_H }} />
          </CardContent>
        </Card>

        <Card className="border-border bg-card p-0">
          <CardContent className="p-5">
            <div>
              <p className="text-xs text-muted-foreground">Open Interest</p>
              <Skeleton className="mt-1 h-7 w-24" />
            </div>
            <div className="my-4 border-t border-border/40" />
            <p className="mb-0.5 text-sm font-medium">Open Interest</p>
            <p className="mb-3 text-xs text-muted-foreground">The open interest over time.</p>
            <Skeleton className="w-full" style={{ height: CHART_H }} />
          </CardContent>
        </Card>
      </div>

      {/* Row 2 — TVL + Daily Active Users */}
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="border-border bg-card p-0">
          <CardContent className="p-5">
            <div className="flex gap-10">
              <div>
                <p className="text-xs text-muted-foreground">TVL</p>
                <Skeleton className="mt-1 h-7 w-20" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">24h Flows</p>
                <Skeleton className="mt-1 h-7 w-40" />
              </div>
            </div>
            <div className="my-4 border-t border-border/40" />
            <p className="mb-0.5 text-sm font-medium">TVL</p>
            <p className="mb-3 text-xs text-muted-foreground">The total value locked over time.</p>
            <Skeleton className="w-full" style={{ height: CHART_H }} />
          </CardContent>
        </Card>

        <Card className="border-border bg-card p-0">
          <CardContent className="p-5">
            <div className="flex gap-10">
              <div>
                <p className="text-xs text-muted-foreground">24h Traders</p>
                <Skeleton className="mt-1 h-7 w-16" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Total Traders</p>
                <Skeleton className="mt-1 h-7 w-16" />
              </div>
            </div>
            <div className="my-4 border-t border-border/40" />
            <p className="mb-0.5 text-sm font-medium">Daily Active Users</p>
            <p className="mb-3 text-xs text-muted-foreground">The daily active traders.</p>
            <Skeleton className="w-full" style={{ height: CHART_H }} />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
