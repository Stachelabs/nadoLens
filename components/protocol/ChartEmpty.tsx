interface ChartEmptyProps {
  height?: number
  message?: string
}

export function ChartEmpty({
  height = 300,
  message = "No data available",
}: ChartEmptyProps) {
  return (
    <div
      className="flex items-center justify-center rounded-lg border border-dashed border-border/50"
      style={{ height }}
    >
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  )
}
