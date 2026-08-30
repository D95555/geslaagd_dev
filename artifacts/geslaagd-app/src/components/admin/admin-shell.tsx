import type { ReactNode } from 'react';
import { useLocation } from 'wouter';
import { ShieldAlert } from 'lucide-react';
import { Button } from '@workspace/geslaagd-momentum/components/ui/button';
import { useSurfaceTheme } from '@workspace/geslaagd-momentum/hooks/use-theme';

/**
 * Just the page's own head (title/intro/actions) and body -- the surrounding
 * chrome (sidebar, top bar, sign-out) lives in AppShell now, which persists
 * across every /beheer route instead of being torn down and rebuilt per page.
 */
export function AdminShell({
  title,
  intro,
  actions,
  children,
}: {
  title: string;
  intro?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="admin-content">
      <div className="admin-content-head">
        <div>
          <h1>{title}</h1>
          {intro && <p>{intro}</p>}
        </div>
        {actions && <div className="admin-content-actions">{actions}</div>}
      </div>
      {children}
    </section>
  );
}

/** Shared refusal screen so every admin page fails the same way. */
export function AdminDenied() {
  const [, setLocation] = useLocation();
  useSurfaceTheme('dark');
  return (
    <main className="admin-denied">
      <ShieldAlert size={22} aria-hidden="true" />
      <h1>Geen toegang.</h1>
      <p>Deze omgeving is alleen voor beheerders.</p>
      <Button onClick={() => setLocation('/')}>Terug naar de homepage</Button>
    </main>
  );
}
