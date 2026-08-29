import { ArrowRight, ChevronRight, Plus, Sparkles } from 'lucide-react';
import { useEffect, useState } from 'react';
import { listSelectedSubjects, type SelectedSubject } from '@workspace/api-client-react';
import { useLocation } from 'wouter';
import { useAuth } from '@/auth/auth-context';
import { ProgressBar } from '@/components/study/progress-bar';
import { StudyPageShell } from '@/components/study/study-page-shell';
import { Button } from '@workspace/geslaagd-momentum/components/ui/button';
import { PageHeader } from '@workspace/geslaagd-momentum/components/layout/page-header';
import { PageSections, Section } from '@workspace/geslaagd-momentum/components/layout/section';
import { EmptyState } from '@workspace/geslaagd-momentum/components/layout/empty-state';
import { CardGridSkeleton } from '@workspace/geslaagd-momentum/components/layout/page-skeleton';

export default function DashboardPage() {
  const [, setLocation] = useLocation();
  const { isLoading, user } = useAuth();
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

  return (
    <StudyPageShell>
      <PageSections>
        <PageHeader
          kicker={
            <>
              <Sparkles size={13} aria-hidden="true" /> jouw leeromgeving
            </>
          }
          title="Waar wil je vandaag grip op krijgen?"
          description="Kies een van je vakken, of blader door de volledige catalogus."
        />

        <Section title="Jouw vakken">
          {state === 'loading' && <CardGridSkeleton cards={3} />}

          {state === 'error' && (
            <EmptyState
              title="Jouw vakken konden niet worden geladen"
              description="Er ging iets mis bij het ophalen. Probeer het opnieuw."
              action={<Button onClick={() => void load()}>Opnieuw proberen</Button>}
            />
          )}

          {state === 'ready' && subjects?.length === 0 && (
            <EmptyState
              icon={<Plus size={20} aria-hidden="true" />}
              title="Kies je eerste vak"
              description="Blader door de catalogus en voeg de vakken toe die je nu volgt."
              action={
                <Button onClick={() => setLocation('/vakken')}>
                  <Plus size={16} /> Naar de catalogus
                </Button>
              }
            />
          )}

          {state === 'ready' && subjects && subjects.length > 0 && (
            <div className="subject-tiles">
              {subjects.map((subject, index) => (
                <button
                  key={subject.id}
                  className="subject-tile"
                  onClick={() => setLocation(`/vakken/${subject.id}`)}
                >
                  <span className="subject-tile-index">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <span className="subject-tile-body">
                    <strong>{subject.name}</strong>
                    <small>
                      {subject.chapterCount ?? 0}{' '}
                      {subject.chapterCount === 1 ? 'hoofdstuk' : 'hoofdstukken'}
                    </small>
                  </span>
                  <ProgressBar value={subject.subjectProgress} />
                  <ChevronRight size={17} className="subject-tile-chevron" aria-hidden="true" />
                </button>
              ))}
            </div>
          )}
        </Section>

        <button
          type="button"
          className="catalog-banner"
          onClick={() => setLocation('/vakken')}
          data-testid="link-subject-catalog"
        >
          <div>
            <span>vakkencatalogus</span>
            <strong>Volledige vakken met hoofdstukken, oefenvragen en tentamens.</strong>
          </div>
          <ArrowRight size={18} aria-hidden="true" />
        </button>
      </PageSections>
    </StudyPageShell>
  );
}
