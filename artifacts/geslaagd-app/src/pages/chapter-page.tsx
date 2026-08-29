import { useEffect, useState } from 'react';
import {
  getChapterContent,
  getSubjectDetail,
  getSubjectProgress,
  markChapterRead,
  type ChapterContent,
  type Chapter,
  type ChapterProgress,
} from '@workspace/api-client-react';
import { Button } from '@workspace/geslaagd-momentum/components/ui/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@workspace/geslaagd-momentum/components/ui/collapsible';
import { BookCheck, ChevronDown, Loader2, MessageCircle } from 'lucide-react';
import { useLocation } from 'wouter';
import { useAuth } from '@/auth/auth-context';
import { ChatPanel } from '@/components/study/chat-panel';
import { CitedText } from '@/components/study/citation-tag';
import { ExerciseView } from '@/components/study/exercise-view';
import { StudyPageShell, StudyPageMessage } from '@/components/study/study-page-shell';

type Activity = 'reading' | 'exercise' | 'exam';

export default function ChapterPage({
  subjectId,
  chapterId,
}: {
  subjectId: string;
  chapterId: string;
}) {
  const [, setLocation] = useLocation();
  const { user, isLoading } = useAuth();

  const [chapter, setChapter] = useState<Chapter | null>(null);
  const [content, setContent] = useState<ChapterContent | null>(null);
  const [progress, setProgress] = useState<ChapterProgress | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'unauthorized' | 'error'>('loading');
  const [activity, setActivity] = useState<Activity>('reading');
  const [chatOpen, setChatOpen] = useState(false);
  const [marking, setMarking] = useState(false);

  const load = async () => {
    setState('loading');
    try {
      const [detail, chapterContent] = await Promise.all([
        getSubjectDetail(subjectId),
        getChapterContent(subjectId, chapterId),
      ]);
      setChapter(detail.chapters.find((item) => item.id === chapterId) ?? null);
      setContent(chapterContent);
      const subjectProgress = await getSubjectProgress(subjectId).catch(() => null);
      setProgress(
        subjectProgress?.chapterProgress.find((row) => row.chapterId === chapterId) ?? null,
      );
      setState('ready');
    } catch (error) {
      setState((error as { status?: number }).status === 401 ? 'unauthorized' : 'error');
    }
  };

  useEffect(() => {
    if (!isLoading && user) void load();
    else if (!isLoading) setState('unauthorized');
  }, [isLoading, user?.id, subjectId, chapterId]);

  const markRead = async () => {
    setMarking(true);
    try {
      await markChapterRead(subjectId, chapterId);
      await load();
    } finally {
      setMarking(false);
    }
  };

  if (state === 'unauthorized') {
    return (
      <StudyPageShell>
        <StudyPageMessage
          title="Log eerst in"
          body="Meld je aan om dit hoofdstuk te bekijken."
          action={<Button onClick={() => setLocation('/auth')}>Inloggen</Button>}
        />
      </StudyPageShell>
    );
  }

  if (state === 'loading') {
    return (
      <StudyPageShell backTo={`/vakken/${subjectId}`} backLabel="Terug naar het vak">
        <p className="study-loading">
          <Loader2 className="spin" size={18} aria-hidden="true" /> Hoofdstuk laden…
        </p>
      </StudyPageShell>
    );
  }

  if (state === 'error' || !chapter) {
    return (
      <StudyPageShell backTo={`/vakken/${subjectId}`} backLabel="Terug naar het vak">
        <div className="study-page-message">
          <p>Dit hoofdstuk kon niet worden geladen.</p>
          <Button onClick={() => void load()}>Opnieuw proberen</Button>
        </div>
      </StudyPageShell>
    );
  }

  if (activity !== 'reading') {
    return (
      <StudyPageShell backTo={`/vakken/${subjectId}`} backLabel="Terug naar het vak">
        <h1 className="chapter-heading">
          {chapter.position}. {chapter.title}
        </h1>
        <ExerciseView
          subjectId={subjectId}
          chapterId={chapterId}
          mode={activity === 'exam' ? 'exam' : 'exercise'}
          onBack={() => {
            setActivity('reading');
            void load();
          }}
        />
      </StudyPageShell>
    );
  }

  return (
    <StudyPageShell backTo={`/vakken/${subjectId}`} backLabel="Terug naar het vak">
      <div className="chapter-head">
        <div>
          <h1 className="chapter-heading">
            {chapter.position}. {chapter.title}
          </h1>
          {chapter.description && <p className="chapter-sub">{chapter.description}</p>}
        </div>
        <Button variant="outline" onClick={() => setChatOpen(true)}>
          <MessageCircle size={15} /> Vraag hierover
        </Button>
      </div>

      {content?.summary ? (
        <article className="chapter-summary" data-testid="chapter-summary">
          <CitedText content={content.summary.body} citations={content.summary.citations} />
        </article>
      ) : (
        <p className="chapter-empty">De samenvatting van dit hoofdstuk is nog in de maak.</p>
      )}

      <div className="chapter-actions">
        <Button
          variant={progress?.summaryRead ? 'secondary' : 'default'}
          disabled={marking || progress?.summaryRead}
          onClick={() => void markRead()}
          data-testid="button-mark-read"
        >
          <BookCheck size={15} />
          {progress?.summaryRead ? 'Gelezen' : 'Markeer als gelezen'}
        </Button>
      </div>

      {content?.keyNotes && content.keyNotes.sections.length > 0 && (
        <Collapsible className="key-notes">
          <CollapsibleTrigger className="key-notes-trigger">
            Kernpunten en formules <ChevronDown size={15} aria-hidden="true" />
          </CollapsibleTrigger>
          <CollapsibleContent>
            {content.keyNotes.sections.map((section) => (
              <section key={section.heading}>
                <h3>{section.heading}</h3>
                <dl>
                  {section.items.map((item) => (
                    <div key={`${section.heading}-${item.label}`}>
                      <dt>{item.label}</dt>
                      <dd>{item.value}</dd>
                    </div>
                  ))}
                </dl>
              </section>
            ))}
          </CollapsibleContent>
        </Collapsible>
      )}

      <section className="chapter-practice">
        <button
          type="button"
          className="practice-card"
          onClick={() => setActivity('exercise')}
          data-testid="button-start-exercises"
        >
          <strong>Oefenvragen</strong>
          <span>
            {progress?.exerciseBestScore
              ? `Beste cijfer: ${progress.exerciseBestScore.toFixed(1)}`
              : 'Nog niet gemaakt'}
          </span>
        </button>
        {chapter.isImportant && (
          <button
            type="button"
            className="practice-card"
            onClick={() => setActivity('exam')}
            data-testid="button-start-exam"
          >
            <strong>Tentamen</strong>
            <span>
              {progress?.examBestScore
                ? `Beste cijfer: ${progress.examBestScore.toFixed(1)}`
                : 'Nog niet gemaakt'}
            </span>
          </button>
        )}
      </section>

      <ChatPanel
        subjectId={subjectId}
        chapterId={chapterId}
        open={chatOpen}
        onClose={() => setChatOpen(false)}
      />
    </StudyPageShell>
  );
}
