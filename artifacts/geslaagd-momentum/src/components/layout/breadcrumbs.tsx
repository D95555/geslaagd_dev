import { Fragment, type ReactNode } from "react"

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "../ui/breadcrumb"

export type Crumb = {
  label: ReactNode
  /** Omit on the last crumb: the current page is not a link. */
  href?: string
}

/**
 * The trail back out of a page. Router-agnostic on purpose -- pass `onNavigate`
 * to intercept for client-side routing, otherwise the hrefs work as plain links.
 */
export function Breadcrumbs({
  items,
  onNavigate,
  className,
}: {
  items: Crumb[]
  onNavigate?: (href: string) => void
  className?: string
}) {
  if (items.length === 0) return null

  return (
    <Breadcrumb className={className}>
      <BreadcrumbList className="type-meta">
        {items.map((item, index) => {
          const isLast = index === items.length - 1
          return (
            <Fragment key={`${item.href ?? "current"}-${index}`}>
              <BreadcrumbItem>
                {isLast || !item.href ? (
                  <BreadcrumbPage>{item.label}</BreadcrumbPage>
                ) : (
                  <BreadcrumbLink
                    href={item.href}
                    onClick={
                      onNavigate &&
                      ((event: React.MouseEvent<HTMLAnchorElement>) => {
                        // Let modified clicks open a new tab as usual.
                        if (event.metaKey || event.ctrlKey || event.shiftKey) return
                        event.preventDefault()
                        onNavigate(item.href!)
                      })
                    }
                  >
                    {item.label}
                  </BreadcrumbLink>
                )}
              </BreadcrumbItem>
              {!isLast && <BreadcrumbSeparator />}
            </Fragment>
          )
        })}
      </BreadcrumbList>
    </Breadcrumb>
  )
}
