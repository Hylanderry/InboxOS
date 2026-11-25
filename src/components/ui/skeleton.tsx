import { cn } from "@/lib/utils";

/**
 * Base skeleton with shimmer animation for progressive loading.
 * Replaces static pulse/spinner loading states across the app.
 */
function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-md bg-neutral-200 dark:bg-white/[0.06]",
        "after:absolute after:inset-0 after:translate-x-[-100%] after:animate-[shimmer_1.8s_infinite] after:bg-gradient-to-r after:from-transparent after:via-white/10 after:to-transparent",
        className,
      )}
      {...props}
    />
  );
}

/** KPI card skeleton matching ux-kpi layout */
function SkeletonKpiCard({ className }: { className?: string }) {
  return (
    <div className={cn("ux-kpi flex flex-col gap-2", className)}>
      <Skeleton className="h-3 w-24" />
      <Skeleton className="h-8 w-16" />
      <Skeleton className="h-3 w-20" />
    </div>
  );
}

/** Table row skeleton matching ux-row layout */
function SkeletonTableRow({ cols = 5, className }: { cols?: number; className?: string }) {
  return (
    <div className={cn("ux-row grid items-center gap-3 px-4 py-3", className)}>
      <Skeleton className="h-8 w-8 rounded-full" />
      {Array.from({ length: cols - 1 }).map((_, i) => (
        <Skeleton key={i} className="h-4 w-full" />
      ))}
    </div>
  );
}

/** Chart area skeleton with axis hints */
function SkeletonChart({ className }: { className?: string }) {
  return (
    <div className={cn("flex h-64 w-full items-end gap-1 px-2 pb-6 pt-2", className)}>
      {Array.from({ length: 12 }).map((_, i) => (
        <Skeleton
          key={i}
          className="flex-1 rounded-t-sm"
          style={{ height: `${30 + Math.random() * 50}%` }}
        />
      ))}
    </div>
  );
}

/** Panel/section skeleton with header + content placeholder */
function SkeletonPanel({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div className={cn("ux-panel space-y-4", className)}>
      <div className="flex items-center justify-between">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-4 w-20" />
      </div>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} className="h-4 w-full" />
      ))}
    </div>
  );
}

export { Skeleton, SkeletonKpiCard, SkeletonTableRow, SkeletonChart, SkeletonPanel };