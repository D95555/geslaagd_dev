import { ArrowLeft, ArrowRight, BookOpenText, ChevronRight, FileClock, PlusCircle, Sparkles } from 'lucide-react';
import { useEffect, useState } from 'react';
import { createStudySpace, getStudyCatalog, getStudySubjectDetail, type StudyBook, type StudyChapter, type StudySubjectDetail } from '@workspace/api-client-react';
import { useLocation } from 'wouter';
import { useAuth } from '@/auth/auth-context';
import { Button } from '@workspace/geslaagd-momentum/components/ui/button';

function topicStatusLabel(status: string): string {
  return status === 'draft' ? 'Concept — nog niet gestart' : 'Klaar om te leren';
}

export default function SubjectDetailPage({ selectionId }: { selectionId: string }) {
  const [, setLocation] = useLocation();
  const { user, isLoading } = useAuth();
  const [detail, setDetail] = useState<StudySubjectDetail | null | undefined>(undefined);
  const [loadError, setLoadError] = useState('');
  const [catalogBooks, setCatalogBooks] = useState<StudyBook[]>([]);
  const [catalogChapters, setCatalogChapters] = useState<StudyChapter[]>([]);
  const [creatingChapterId, setCreatingChapterId] = useState<string | null>(null);
  const [chapterError, setChapterError] = useState('');

  const load = () => {
    setDetail(undefined);
    setLoadError('');
    getStudySubjectDetail(selectionId)
      .then(async (nextDetail) => {
        setDetail(nextDetail);
        if (nextDetail.subject) {
          try {
            const catalog = await getStudyCatalog({ subjectId: nextDetail.subject.id });
            setCatalogBooks(catalog.books);
            setCatalogChapters(catalog.chapters);
          } catch {
            // Catalog is a supplementary quick-start; the main subject page still works without it.
          }
        }
      })
      .catch(() => {
        setDetail(null);
        setLoadError('Dit vak kon niet worden geladen.');
      });
  };

  const createFromChapter = async (book: StudyBook, chapter: StudyChapter) => {
    setCreatingChapterId(chapter.id);
    try {
      const space = await createStudySpace({
        title: `${detail?.selection.name ?? book.title} · ${chapter.title}`,
        subjectId: book.subjectId,
        bookId: book.id,
        chapterId: chapter.id,
        selectedSubjectId: selectionId,
      });
      setLocation(`/mijn-leeromgeving/${space.id}`);
    } catch {
      setChapterError('Deze studieplek kon niet worden aangemaakt.');
    } finally {
      setCreatingChapterId(null);
    }
  };

  useEffect(() => {
    if (!isLoading && !user) setLocation('/auth');
    if (user) load();
  }, [isLoading, user?.id, selectionId]);

  if (isLoading || !user) {
    return <main className="auth-page auth-loading-page"><p>Je vak wordt geladen…</p></main>;
  }

  const header = (
    <header className="dashboard-header">
      <button className="auth-brand" onClick={() => setLocation('/mijn-leeromgeving')} aria-label="Terug naar geslaagd.app">
        <span className="wordmark-mark" /><span>geslaagd.app</span>
      </button>
    </header>
  );

  if (detail === undefined) {
    return <main className="study-page dark">{header}<section className="study-shell"><p role="status">Dit vak wordt geladen…</p></section></main>;
  }

  if (detail === null) {
    return <main className="study-page dark">{header}<section className="study-detail" role="alert">
      <span className="study-kicker"><Sparkles size={15} /> vak</span>
      <h1>Dit vak kon niet worden geopend.</h1>
      <p>{loadError || 'De link klopt niet meer of dit vak is niet van jou.'}</p>
      <div className="proposal-actions">
        <Button onClick={load}>Opnieuw proberen</Button>
        <Button className="quiet" variant="ghost" onClick={() => setLocation('/mijn-leeromgeving')}><ArrowLeft size={15} /> Mijn leeromgeving</Button>
      </div>
    </section></main>;
  }

  const { selection, subject, results, recentTopics, topics } = detail;
  const description = subject?.description || 'Voor dit vak is nog geen standaardbeschrijving beschikbaar — je kunt er zelf één toevoegen bij een nieuw onderwerp.';

  return <main className="study-page dark">
    {header}
    <section className="study-shell">
      <Button className="back-link" variant="ghost" onClick={() => setLocation('/mijn-leeromgeving')}><ArrowLeft size={15} /> Mijn leeromgeving</Button>

      <div className="subject-detail-hero">
        <div>
          <span className="study-kicker"><Sparkles size={15} /> vak</span>
          <h1>{selection.name}</h1>
          <p>{description}</p>
        </div>
        <Button onClick={() => setLocation(`/mijn-leeromgeving/vak/${selection.id}/nieuw-onderwerp`)}>
          <PlusCircle size={16} /> Nieuw onderwerp
        </Button>
      </div>

      {chapterError && <p className="study-message" role="alert">{chapterError}</p>}

      {catalogBooks.length > 0 && <section className="books-section" aria-labelledby="subject-books-heading">
        <div className="section-title"><div><span>BOEKEN</span><h2 id="subject-books-heading">Snel starten met een hoofdstuk</h2><p>We tonen methodes en hoofdstukstructuren — geen gekopieerde boekinhoud.</p></div></div>
        <div className="book-list">{catalogBooks.map((book) => <article className="book-card" key={book.id}>
          <div className="book-meta"><span>{book.publisher} · {book.edition}</span><h3>{book.title}</h3><p>{book.description}</p></div>
          <div className="chapter-list">{catalogChapters.filter((chapter) => chapter.bookId === book.id).map((chapter) => (
            <button key={chapter.id} disabled={creatingChapterId !== null} onClick={() => createFromChapter(book, chapter)}>
              <span>H{chapter.chapterNumber}</span>
              <div><strong>{chapter.title}</strong><small>{chapter.topics.join(' · ')}</small></div>
              <ArrowRight size={16} />
            </button>
          ))}</div>
        </article>)}</div>
      </section>}

      <section className="subject-results-section" aria-labelledby="subject-results-heading">
        <div className="section-title">
          <div><span>RESULTATEN</span><h2 id="subject-results-heading">Hoe het gaat</h2></div>
          {results.isPlaceholder && <span className="placeholder-badge">Voorbeelddata</span>}
        </div>
        <p className="subject-results-note">{results.note}</p>
        <div className="subject-results-grid">
          {results.items.map((item) => (
            <article key={item.label} className="subject-result-card">
              <span>{item.label}</span>
              <strong>{item.value}</strong>
            </article>
          ))}
        </div>
      </section>

      <section className="recent-section" aria-labelledby="recent-topics-heading">
        <div className="section-title"><div><span>LAATST BEKEKEN</span><h2 id="recent-topics-heading">Ga verder waar je gebleven was</h2></div></div>
        {recentTopics.length === 0
          ? <p className="study-empty">Je hebt bij dit vak nog geen onderwerp geopend. Maak hieronder je eerste onderwerp aan.</p>
          : <div className="recent-list">{recentTopics.map((topic) => (
              <button key={topic.id} onClick={() => setLocation(`/mijn-leeromgeving/${topic.id}`)}>
                <FileClock size={18} />
                <div><strong>{topic.title}</strong><small>{topicStatusLabel(topic.status)}</small></div>
                <ChevronRight size={17} />
              </button>
            ))}</div>}
      </section>

      <section className="subjects-section" aria-labelledby="all-topics-heading">
        <div className="section-title"><div><span>OVERZICHT</span><h2 id="all-topics-heading">Alle onderwerpen bij {selection.name}</h2></div></div>
        {topics.length === 0
          ? <div className="study-empty-card">
              <p className="eyebrow"><span className="eyebrow-dot" /> aan de slag</p>
              <h1>Nog geen onderwerpen</h1>
              <p>Maak je eerste onderwerp voor {selection.name} — kies zelf het niveau, deelonderwerpen en bronnen.</p>
              <Button onClick={() => setLocation(`/mijn-leeromgeving/vak/${selection.id}/nieuw-onderwerp`)}><PlusCircle size={16} /> Nieuw onderwerp</Button>
            </div>
          : <div className="topic-catalog-list">{topics.map((topic) => (
              <article key={topic.id} className="topic-catalog-card">
                <div className="topic-catalog-meta">
                  <span className={`topic-status-tag ${topic.status}`}>{topicStatusLabel(topic.status)}</span>
                  {topic.level && <span className="topic-level-tag">Niveau: {topic.level}</span>}
                </div>
                <h3>{topic.title}</h3>
                {topic.subtopics.length > 0 && <p className="topic-catalog-subtopics">{topic.subtopics.join(' · ')}</p>}
                <div className="topic-catalog-actions">
                  <Button onClick={() => setLocation(`/mijn-leeromgeving/${topic.id}`)}>
                    {topic.status === 'draft' ? 'Concept openen' : 'Verder leren'} <ArrowRight size={15} />
                  </Button>
                  <Button className="quiet" variant="ghost" onClick={() => setLocation(`/mijn-leeromgeving/onderwerp/${topic.id}/bewerken`)}>
                    Onderwerp aanpassen
                  </Button>
                </div>
              </article>
            ))}</div>}
      </section>

      {topics.length === 0 && recentTopics.length === 0 && <p className="study-empty" style={{ marginTop: 24 }}>
        <BookOpenText size={15} style={{ verticalAlign: 'middle', marginRight: 6 }} />
        Je kunt ook je studiecoach vragen — ga terug naar je leeromgeving en beschrijf je vraag in eigen woorden.
      </p>}
    </section>
  </main>;
}
