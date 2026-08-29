import type { ReactNode } from "react"

import { cn } from "../../lib/utils"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "../ui/empty"

/**
 * Nothing here yet, nothing found, or nothing left to do. Says what happened
 * and what to do next -- an empty list with no explanation reads as a bug.
 */
export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode
  title: ReactNode
  description?: ReactNode
  action?: ReactNode
  className?: string
}) {
  return (
    <Empty className={cn("border border-dashed border-border", className)}>
      <EmptyHeader>
        {icon && <EmptyMedia variant="icon">{icon}</EmptyMedia>}
        <EmptyTitle className="type-heading3">{title}</EmptyTitle>
        {description && (
          <EmptyDescription className="type-body">{description}</EmptyDescription>
        )}
      </EmptyHeader>
      {action && <EmptyContent>{action}</EmptyContent>}
    </Empty>
  )
}
