import { cn } from "@/lib/utils";

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn(
        "animate-pulse rounded-md bg-muted-foreground/15 ring-1 ring-border/40 dark:bg-muted-foreground/28 dark:ring-border/60",
        className,
      )}
      {...props}
    />
  );
}

export { Skeleton };
