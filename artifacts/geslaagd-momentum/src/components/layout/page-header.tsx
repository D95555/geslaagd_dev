import type { ReactNode } from "react"

import { cn } from "../../lib/utils"

/**
 * The top of every page: where you are, what this is, and what you can do here.
 * One per screen. Sizes come from the semantic type ramp so page titles match
 * across the product instead of each surface picking its own.
 */
export function PageHeader({
  breadcrumbs,
  kicker,
  title,
  description,
  actions,
  className,
}: {
  breadcrumbs?: ReactNode
  kicker?: ReactNode
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
  className?: string
}) {
  return (
    <header className={cn("flex flex-col gap-[var(--density-block-gap)]", className)}>
      {breadcrumbs}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          {kicker && (
            <div className="type-meta flex items-center gap-2 uppercase text-muted-foreground">
              {kicker}
            </div>
          )}
          <h1 className="type-heading1 text-foreground">{title}</h1>
          {description && (
            // Capped for readability: a title's description should not run the
            // full width of a wide screen.
            <p className="type-body max-w-[68ch] text-muted-foreground">{description}</p>
          )}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </header>
  )
}
