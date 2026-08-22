import { ArrowLeft, BookOpenText, Pencil, Sparkles } from 'lucide-react';
import { useEffect, useState } from 'react';
import { getStudySpace, type StudySpace } from '@workspace/api-client-react';
import { useLocation } from 'wouter';
import { useAuth } from '@/auth/auth-context';
import { Button } from '@workspace/geslaagd-momentum/components/ui/button';

export default function StudyDetailPage({ spaceId }: { spaceId: string }) {
  const [, setLocation] = useLocation();
  const { user, isLoading } = useAuth();
  const [space, setSpace] = useState<StudySpace | null | undefined>(undefined);

  useEffect(() => {
    if (!isLoading && !user) setLocation('/auth');
    if (user) void getStudySpace(spaceId).then(setSpace).catch(() => setSpace(null));
  }, [isLoading, user?.id, spaceId]);

  if (isLoading || !user) return <main className="auth-page auth-loading-page"><p>Je onderwerp wordt geladen…</p></main>;

  const header = (
    <header className="dashboard-header">
      <button className="auth-brand" onClick={() => setLocation('/mijn-leeromgeving')} aria-label="Terug naar geslaagd.app">
        <span className="wordmark-mark" /><span>geslaagd.app</span>
      </button>
    </header>
  );

  if (space === undefined) {
    return <main className="study-page dark">{header}<section className="study-detail"><p role="status">Je onderwerp wordt geladen…</p></section></main>;
  }

  if (!space) {
    return <main className="study-page dark">
      {header}
      <section className="study-detail">
        <span className="study-kicker"><Sparkles size={15} /> onderwerp</span>
        <h1>Dit onderwerp is er niet.</h1>
        <p>De link klopt niet meer of dit onderwerp is niet van jou.</p>
        <Button className="button-large" onClick={() => setLocation('/mijn-leeromgeving')}>Naar mijn leeromgeving <ArrowLeft size={15} /></Button>
      </section>
    </main>;
  }

  const backTarget = space.selectedSubjectId ? `/mijn-leeromgeving/vak/${space.selectedSubjectId}` : '/mijn-leeromgeving';

  return <main className="study-page dark">
    {header}
    <section className="study-detail">
      <Button className="back-link" variant="ghost" onClick={() => setLocation(backTarget)}>
        <ArrowLeft size={15} /> {space.selectedSubjectId ? 'Terug naar vak' : 'Mijn leeromgeving'}
      </Button>
      <div className="study-detail-heading">
        <span className="study-kicker"><Sparkles size={15} /> {space.sourceType === 'ai' ? 'studiecoach' : 'boek en hoofdstuk'}</span>
        <Button className="quiet" variant="ghost" onClick={() => setLocation(`/mijn-leeromgeving/onderwerp/${space.id}/bewerken`)}>
          <Pencil size={15} /> Onderwerp aanpassen
        </Button>
      </div>
      <h1>{space.title}</h1>
      <p>Dit is jouw vaste vertrekpunt. Hier komen betrouwbare bronnen, een heldere samenvatting en uitleg op jouw niveau samen.</p>

      {(space.level || space.subtopics.length > 0 || space.sources.length > 0) && (
        <dl className="study-detail-meta">
          {space.level && <div><dt>Niveau</dt><dd>{space.level}</dd></div>}
          {space.subtopics.length > 0 && <div><dt>Deelonderwerpen</dt><dd>{space.subtopics.join(' · ')}</dd></div>}
          {space.sources.length > 0 && <div><dt>Bronnen</dt><dd>{space.sources.join(' · ')}</dd></div>}
        </dl>
      )}

      <div className="detail-placeholder">
        <BookOpenText size={25} />
        <div>
          <strong>{space.status === 'draft' ? 'Je concept staat klaar.' : 'Je studieplek staat klaar.'}</strong>
          <span>De samenvatting en oefenvragen volgen hier. Je kunt nu al je onderwerp bewaren of aanpassen.</span>
        </div>
      </div>
    </section>
  </main>;
}
