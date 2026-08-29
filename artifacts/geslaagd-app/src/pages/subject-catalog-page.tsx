import { useEffect, useState } from 'react';
import { listSubjects, selectSubject, type SubjectSummary } from '@workspace/api-client-react';
import { Button } from '@workspace/geslaagd-momentum/components/ui/button';
import { Badge } from '@workspace/geslaagd-momentum/components/ui/badge';
import { BookOpen, Loader2, Plus } from 'lucide-react';
import { useLocation } from 'wouter';
import { useAuth } from '@/auth/auth-context';
import { StudyPageShell, StudyPageMessage } from '@/components/study/study-page-shell';

export default function SubjectCatalogPage() {
  const [, setLocation] = useLocation();
  const { user, isLoading } = useAuth();
  const [subjects, setSubjects] = useState<SubjectSummary[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'unauthorized' | 'error'>('loading');
  const [adding, setAdding] = useState<string | null>(null);

  const load = async () => {
    setState('loading');
    try {
      setSubjects(await listSubjects());
      setState('ready');
    } catch (error) {
      setState((error as { status?: number }).status === 401 ? 'unauthorized' : 'error');
    }
  };

  useEffect(() => {
    if (!isLoading && user) void load();
    else if (!isLoading) setState('unauthorized');
  }, [isLoading, user?.id]);

  const addSubject = async (subject: SubjectSummary) => {
    setAdding(subject.id);
    try {
      await selectSubject(subject.id);
      setLocation(`/vakken/${subject.id}`);
    } catch {
      setAdding(null);
    }
  };

  if (state === 'unauthorized') {
    return (
      <StudyPageShell>
        <StudyPageMessage
          title="Log eerst in"
          body="Meld je aan om de vakkencatalogus te bekijken."
          action={<Button onClick={() => setLocation('/auth')}>Inloggen</Button>}
        />
      </StudyPageShell>
    );
  }

  return (
    <StudyPageShell backTo="/mijn-leeromgeving" backLabel="Terug naar mijn leeromgeving">
      <div className="study-hero">
        <div>
          <span className="study-kicker">
            <BookOpen size={15} /> vakkencatalogus
          </span>
          <h1>Kies een vak om mee te beginnen.</h1>
          <p>
            Elk vak is opgedeeld in hoofdstukken met uitleg, oefenvragen en tentamens.
          </p>
        </div>
      </div>

      {state === 'loading' && (
        <p className="study-loading">
          <Loader2 className="spin" size={18} aria-hidden="true" /> Vakken laden…
        </p>
      )}

      {state === 'error' && (
        <div className="study-page-message">
          <p>De vakken konden niet worden geladen.</p>
          <Button onClick={() => void load()}>Opnieuw proberen</Button>
        </div>
      )}

      {state === 'ready' && subjects.length === 0 && (
        <div className="study-page-message">
          <h2>Nog geen vakken beschikbaar</h2>
          <p>
            Er zijn nog geen vakken gepubliceerd. Vraag een vak aan vanuit je leeromgeving —
            dan gaan we ermee aan de slag.
          </p>
        </div>
      )}

      {state === 'ready' && subjects.length > 0 && (
        <ul className="subject-grid" data-testid="subject-grid">
          {subjects.map((subject) => (
            <li key={subject.id} className="subject-card">
              <div className="subject-card-head">
                <h2>{subject.name}</h2>
                <Badge variant="secondary">
                  {subject.yearLevel === 'vwo' ? 'VWO' : 'Bachelor 1'}
                </Badge>
              </div>
              {subject.difficultyLevel && (
                <span className="subject-level">{subject.difficultyLevel}</span>
              )}
              <p className="subject-description">
                {subject.description ?? 'Beschrijving volgt binnenkort.'}
              </p>
              <div className="subject-card-foot">
                <span>
                  {subject.chapterCount ?? 0}{' '}
                  {subject.chapterCount === 1 ? 'hoofdstuk' : 'hoofdstukken'}
                </span>
                <div className="subject-card-actions">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setLocation(`/vakken/${subject.id}`)}
                  >
                    Bekijken
                  </Button>
                  <Button
                    size="sm"
                    disabled={adding === subject.id}
                    onClick={() => void addSubject(subject)}
                  >
                    <Plus size={15} /> Toevoegen
                  </Button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </StudyPageShell>
  );
}
