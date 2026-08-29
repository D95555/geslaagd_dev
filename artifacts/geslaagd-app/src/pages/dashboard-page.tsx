import { ArrowLeft, ArrowRight, ChevronRight, Loader2, LogOut, Plus, ShieldCheck, Sparkles } from 'lucide-react';
import { useEffect, useState } from 'react';
import { listSelectedSubjects, type SelectedSubject } from '@workspace/api-client-react';
import { useLocation } from 'wouter';
import { useAuth } from '@/auth/auth-context';
import { ProgressBar } from '@/components/study/progress-bar';
import { Button } from '@workspace/geslaagd-momentum/components/ui/button';

export default function DashboardPage() {
  const [, setLocation] = useLocation();
  const { isLoading, user, isAdmin, signOut } = useAuth();
  const [subjects, setSubjects] = useState<SelectedSubject[] | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');

  const load = async () => {
    setState('loading');
    try {
      setSubjects(await listSelectedSubjects());
      setState('ready');
    } catch {
      setState('error');
    }
  };

  useEffect(() => {
    if (!isLoading && !user) setLocation('/auth');
    if (user) void load();
  }, [isLoading, user?.id]);

  if (isLoading || !user) {
    return (
      <main className="auth-page auth-loading-page">
        <p>Je leeromgeving wordt geladen…</p>
      </main>
    );
  }

  const leave = async () => {
    await signOut();
    setLocation('/');
  };

  return (
    <main className="study-page">
      <header className="dashboard-header">
        <button className="auth-brand" onClick={() => setLocation('/')} aria-label="Terug naar geslaagd.app">
          <span className="wordmark-mark" />
          <span>geslaagd.app</span>
        </button>
        <div className="dashboard-actions">
          <span>{user.email}</span>
          {isAdmin && (
            <button type="button" onClick={() => setLocation('/beheer')} data-testid="button-admin-dashboard">
              <ShieldCheck size={15} /> Beheer
            </button>
          )}
          <button type="button" onClick={leave}>
            <LogOut size={15} /> Uitloggen
          </button>
        </div>
      </header>

      <section className="study-shell">
        <div className="study-hero">
          <div>
            <span className="study-kicker">
              <Sparkles size={15} /> jouw leeromgeving
            </span>
            <h1>Waar wil je vandaag grip op krijgen?</h1>
            <p>Kies een van je vakken, of blader door de volledige catalogus.</p>
          </div>
        </div>

        <button
          type="button"
          className="catalog-banner"
          onClick={() => setLocation('/vakken')}
          data-testid="link-subject-catalog"
        >
          <div>
            <span>VAKKENCATALOGUS</span>
            <strong>Volledige vakken met hoofdstukken, oefenvragen en tentamens.</strong>
          </div>
          <ArrowRight size={18} aria-hidden="true" />
        </button>

        <section className="subjects-section">
          <div className="section-title">
            <div>
              <span>VAKKEN</span>
              <h2>Jouw vakken</h2>
            </div>
          </div>

          {state === 'loading' && (
            <p className="study-loading">
              <Loader2 className="spin" size={18} aria-hidden="true" /> Vakken laden…
            </p>
          )}

          {state === 'error' && (
            <div className="study-page-message">
              <p>Jouw vakken konden niet worden geladen.</p>
              <Button onClick={() => void load()}>Opnieuw proberen</Button>
            </div>
          )}

          {state === 'ready' && subjects && subjects.length === 0 && (
            <div className="study-empty-card">
              <p className="eyebrow">
                <span className="eyebrow-dot" /> aan de slag
              </p>
              <h1>Kies je eerste vak</h1>
              <p>Blader door de catalogus en voeg de vakken toe die je nu volgt.</p>
              <Button type="button" onClick={() => setLocation('/vakken')}>
                <Plus size={16} /> Naar de catalogus
              </Button>
            </div>
          )}

          {state === 'ready' && subjects && subjects.length > 0 && (
            <div className="subject-grid">
              {subjects.map((subject, index) => (
                <button
                  key={subject.id}
                  className="subject-card"
                  onClick={() => setLocation(`/vakken/${subject.id}`)}
                >
                  <span>{String(index + 1).padStart(2, '0')}</span>
                  <strong>{subject.name}</strong>
                  <small>
                    {subject.chapterCount ?? 0}{' '}
                    {subject.chapterCount === 1 ? 'hoofdstuk' : 'hoofdstukken'}
                  </small>
                  <ProgressBar value={subject.subjectProgress} />
                  <ChevronRight size={17} />
                </button>
              ))}
            </div>
          )}
        </section>

        <button className="dashboard-back" type="button" onClick={() => setLocation('/')}>
          <ArrowLeft size={15} /> Terug naar de homepage
        </button>
      </section>
    </main>
  );
}
