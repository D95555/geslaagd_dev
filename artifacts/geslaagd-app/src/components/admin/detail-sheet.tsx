import type { ReactNode } from 'react';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@workspace/geslaagd-momentum/components/ui/sheet';

/**
 * One right-side slide-in panel used everywhere an admin page needs to show
 * "the rest of the details" for something clicked in a list: a task, a
 * subject request, a Verkenner object. Keeping this in one place means every
 * "show details" interaction across /beheer looks and behaves the same way.
 */
export function DetailSheet({
  open,
  onClose,
  title,
  description,
  footer,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Sheet open={open} onOpenChange={(next) => !next && onClose()}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-4 overflow-y-auto sm:max-w-lg"
      >
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">{title}</SheetTitle>
          {description && <SheetDescription>{description}</SheetDescription>}
        </SheetHeader>
        <div className="flex flex-1 flex-col gap-4">{children}</div>
        {footer && <div className="flex flex-col gap-2 border-t border-border pt-4">{footer}</div>}
      </SheetContent>
    </Sheet>
  );
}
