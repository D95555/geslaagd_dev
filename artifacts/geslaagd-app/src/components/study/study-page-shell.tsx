import type { ReactNode } from 'react';
import { useLocation } from 'wouter';
import { ArrowLeft } from 'lucide-react';

/**
 * The student page's own content wrapper and optional back link. The brand
 * header, sign-out and nav now live in AppShell, mounted once for the whole
 * student surface instead of being rebuilt by every page.
 */
export function StudyPageShell({
  children,
  backTo,
  backLabel,
}: {
  children: ReactNode;
  backTo?: string;
  backLabel?: string;
}) {
  const [, setLocation] = useLocation();

  return (
    <section className="study-shell">
      {backTo && (
        <button className="dashboard-back" type="button" onClick={() => setLocation(backTo)}>
          <ArrowLeft size={15} /> {backLabel ?? 'Terug'}
        </button>
      )}
      {children}
    </section>
  );
}

export function StudyPageMessage({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="study-page-message">
      <h1>{title}</h1>
      <p>{body}</p>
      {action}
    </div>
  );
}
