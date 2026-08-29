import type { ReactNode } from "react"

import { cn } from "../../lib/utils"

/**
 * A titled block within a page. Spacing comes from the density scale, so the
 * same section reads roomy on a study screen and tight in admin without the
 * page choosing numbers.
 */
export function Section({
  title,
  description,
  actions,
  children,
  className,
}: {
  title?: ReactNode
  description?: ReactNode
  actions?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section className={cn("flex flex-col gap-[var(--density-block-gap)]", className)}>
      {(title || actions) && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-1">
            {title && <h2 className="type-heading2 text-foreground">{title}</h2>}
            {description && (
              <p className="type-body text-muted-foreground">{description}</p>
            )}
          </div>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  )
}

/** Vertical rhythm between the sections of a page. */
export function PageSections({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div className={cn("flex flex-col gap-[var(--density-section-gap)]", className)}>
      {children}
    </div>
  )
}
