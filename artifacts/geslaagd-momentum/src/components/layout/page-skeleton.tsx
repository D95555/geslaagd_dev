import { cn } from "../../lib/utils"
import { Skeleton } from "../ui/skeleton"

/**
 * Loading states that keep the page's shape instead of replacing it with a
 * spinner. The layout stays put while data arrives, so navigation stops
 * flashing between an empty frame and the real content.
 */

export function PageHeaderSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("flex flex-col gap-[var(--density-block-gap)]", className)}>
      <Skeleton className="h-3.5 w-48" />
      <div className="flex flex-col gap-2">
        <Skeleton className="h-8 w-[min(24rem,70%)]" />
        <Skeleton className="h-4 w-[min(40rem,90%)]" />
      </div>
    </div>
  )
}

/** A stand-in for a list of rows: chapters, sources, tasks, accounts. */
export function ListSkeleton({
  rows = 4,
  className,
}: {
  rows?: number
  className?: string
}) {
  return (
    <div className={cn("flex flex-col gap-2", className)} aria-hidden="true">
      {Array.from({ length: rows }, (_, index) => (
        <Skeleton
          key={index}
          className="h-[calc(var(--density-control-height)*1.4)] w-full rounded-lg"
        />
      ))}
    </div>
  )
}

/** A stand-in for a row of stat or subject cards. */
export function CardGridSkeleton({
  cards = 3,
  className,
}: {
  cards?: number
  className?: string
}) {
  return (
    <div
      className={cn(
        "grid gap-[var(--density-block-gap)] sm:grid-cols-2 lg:grid-cols-3",
        className
      )}
      aria-hidden="true"
    >
      {Array.from({ length: cards }, (_, index) => (
        <Skeleton key={index} className="h-32 w-full rounded-xl" />
      ))}
    </div>
  )
}

/**
 * A whole page's worth: header plus body. `label` is announced to screen
 * readers, which get a status message rather than a pile of empty boxes.
 */
export function PageSkeleton({
  label = "Laden…",
  children,
  className,
}: {
  label?: string
  children?: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={cn("flex flex-col gap-[var(--density-section-gap)]", className)}
      role="status"
      aria-busy="true"
      aria-live="polite"
    >
      <span className="sr-only">{label}</span>
      <PageHeaderSkeleton />
      {children ?? <ListSkeleton />}
    </div>
  )
}
