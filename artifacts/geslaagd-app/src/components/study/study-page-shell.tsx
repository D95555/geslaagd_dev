import type { ReactNode } from 'react';
import { useLocation } from 'wouter';
import { ArrowLeft, LogOut, ShieldCheck } from 'lucide-react';
import { useSurfaceTheme } from '@workspace/geslaagd-momentum/hooks/use-theme';
import { useAuth } from '@/auth/auth-context';

/** The shared student page frame: brand header, sign-out and a back link. */
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
  const { user, isAdmin, signOut } = useAuth();

  // Deep ink is the learning environment, per the design guidelines.
  useSurfaceTheme('dark');

  const leave = async () => {
    await signOut();
    setLocation('/');
  };

  return (
    <main className="study-page grid-ground">
      <header className="dashboard-header">
        <button
          className="auth-brand"
          onClick={() => setLocation('/')}
          aria-label="Terug naar geslaagd.app"
        >
          <span className="wordmark-mark" />
          <span>geslaagd.app</span>
        </button>
        <div className="dashboard-actions">
          {user && <span>{user.email}</span>}
          {isAdmin && (
            <button
              type="button"
              onClick={() => setLocation('/beheer')}
              data-testid="button-admin-dashboard"
            >
              <ShieldCheck size={15} /> Beheer
            </button>
          )}
          <button type="button" onClick={leave}>
            <LogOut size={15} /> Uitloggen
          </button>
        </div>
      </header>

      <section className="study-shell">
        {backTo && (
          <button className="dashboard-back" type="button" onClick={() => setLocation(backTo)}>
            <ArrowLeft size={15} /> {backLabel ?? 'Terug'}
          </button>
        )}
        {children}
      </section>
    </main>
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
