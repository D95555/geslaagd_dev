import { useEffect, useState, type MouseEvent as ReactMouseEvent } from 'react';
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
import {
  BookCheck,
  BookOpen,
  ChevronDown,
  GraduationCap,
  MessageCircle,
  PencilLine,
  Sparkles,
  TriangleAlert,
  X,
} from 'lucide-react';
import { useLocation } from 'wouter';
import { useAuth } from '@/auth/auth-context';
import { useContextRail } from '@/components/shell/rail-context';
import { ChatPanel } from '@/components/study/chat-panel';
import { CitedText } from '@/components/study/citation-tag';
import { ExerciseView } from '@/components/study/exercise-view';
import { StudyPageShell, StudyPageMessage } from '@/components/study/study-page-shell';
import { PageHeader } from '@workspace/geslaagd-momentum/components/layout/page-header';
import { PageSections } from '@workspace/geslaagd-momentum/components/layout/section';
import { EmptyState } from '@workspace/geslaagd-momentum/components/layout/empty-state';
import {
  PageSkeleton,
  TextSkeleton,
} from '@workspace/geslaagd-momentum/components/layout/page-skeleton';

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
  // Kept so the page kicker can still name the subject this chapter belongs
  // to (the sidebar shows it too, but not when the sidebar is collapsed).
  const [subjectName, setSubjectName] = useState<string | null>(null);
  const [content, setContent] = useState<ChapterContent | null>(null);
  const [progress, setProgress] = useState<ChapterProgress | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'unauthorized' | 'error'>('loading');
  const [activity, setActivity] = useState<Activity>('reading');
  const [chatOpen, setChatOpen] = useState(false);
  const [chatPrompt, setChatPrompt] = useState('');
  const [selectedText, setSelectedText] = useState('');
  const [marking, setMarking] = useState(false);

  const load = async () => {
    setState('loading');
    try {
      const [detail, chapterContent] = await Promise.all([
        getSubjectDetail(subjectId),
        getChapterContent(subjectId, chapterId),
      ]);
      setChapter(detail.chapters.find((item) => item.id === chapterId) ?? null);
      setSubjectName(detail.name);
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

  const openChat = (prompt = '') => {
    setChatPrompt(prompt);
    setChatOpen(true);
  };

  const captureSelection = (event: ReactMouseEvent<HTMLElement>) => {
    const selection = window.getSelection();
    if (!selection?.anchorNode || !event.currentTarget.contains(selection.anchorNode)) return;
    const text = selection.toString().trim().replace(/\s+/g, ' ');
    if (text.length >= 3) setSelectedText(text.slice(0, 500));
  };

  // Key notes and formulas are reference material for while you're reading
  // or practicing, not the reading itself, so they live in the context rail
  // instead of interrupting the summary as an inline collapsible. Registered
  // unconditionally (and regardless of `activity`) so it stays put across
  // the reading/exercise/exam views instead of flickering on navigation.
  useContextRail(content ? (
    <div className="chapter-rail">
      <section className="chapter-ai-card">
        <span><Sparkles size={14} aria-hidden="true" /> AI met hoofdstukcontext</span>
        <strong>Loop je ergens vast?</strong>
        <p>Vraag om een andere uitleg, een voorbeeld of een korte overhoring.</p>
        <Button size="sm" onClick={() => openChat()}>
          <MessageCircle size={15} /> Vraag de studieassistent
        </Button>
      </section>

      {content.keyNotes && content.keyNotes.sections.length > 0 && (
        <Collapsible className="key-notes" defaultOpen>
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
    </div>
  ) : null);

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
      <StudyPageShell>
        <PageSkeleton label="Hoofdstuk laden…">
          <div className="chapter-summary-skeleton">
            <TextSkeleton lines={8} />
          </div>
        </PageSkeleton>
      </StudyPageShell>
    );
  }

  if (state === 'error' || !chapter) {
    return (
      <StudyPageShell backTo={`/vakken/${subjectId}`} backLabel="Terug naar het vak">
        <EmptyState
          title="Dit hoofdstuk kon niet worden geladen"
          description="Er ging iets mis bij het ophalen. Probeer het opnieuw."
          action={<Button onClick={() => void load()}>Opnieuw proberen</Button>}
        />
      </StudyPageShell>
    );
  }

  return (
    <StudyPageShell>
      <PageSections className="chapter-workspace">
      <PageHeader
        kicker={subjectName ?? undefined}
        title={`${chapter.position}. ${chapter.title}`}
        description={chapter.description ?? undefined}
        actions={
          <Button variant="outline" onClick={() => openChat()}>
            <MessageCircle size={15} /> Vraag hierover
          </Button>
        }
      />

      <nav className="chapter-mode-switcher" aria-label="Hoofdstukonderdelen">
        <button
          type="button"
          className={activity === 'reading' ? 'is-active' : undefined}
          aria-current={activity === 'reading' ? 'page' : undefined}
          onClick={() => setActivity('reading')}
        >
          <BookOpen size={16} aria-hidden="true" /> Lezen
        </button>
        <button
          type="button"
          className={activity === 'exercise' ? 'is-active' : undefined}
          aria-current={activity === 'exercise' ? 'page' : undefined}
          onClick={() => setActivity('exercise')}
        >
          <PencilLine size={16} aria-hidden="true" /> Oefenen
        </button>
        {chapter.isImportant && (
          <button
            type="button"
            className={activity === 'exam' ? 'is-active' : undefined}
            aria-current={activity === 'exam' ? 'page' : undefined}
            onClick={() => setActivity('exam')}
          >
            <GraduationCap size={16} aria-hidden="true" /> Tentamen
          </button>
        )}
      </nav>

      {activity !== 'reading' ? (
        <ExerciseView
          subjectId={subjectId}
          chapterId={chapterId}
          mode={activity === 'exam' ? 'exam' : 'exercise'}
          onBack={() => {
            setActivity('reading');
            void load();
          }}
        />
      ) : (
        <>

      {content && content.contradictions.length > 0 && (
        <section className="chapter-contradictions" aria-label="Tegenstrijdige bronnen">
          <div className="chapter-contradictions-head">
            <TriangleAlert size={15} aria-hidden="true" />
            <strong>Let op: bronnen spreken elkaar tegen</strong>
          </div>
          <p>Voor dit hoofdstuk verschillen bronnen over de volgende punten. Weeg ze kritisch af.</p>
          <ul>
            {content.contradictions.map((item, index) => (
              <li key={`${item.topic}-${index}`}>
                <strong>{item.topic}.</strong> {item.description}
              </li>
            ))}
          </ul>
        </section>
      )}

      {content?.summary ? (
        <article
          className="chapter-summary"
          data-testid="chapter-summary"
          onMouseUp={captureSelection}
        >
          {selectedText && (
            <div className="selection-assistant" role="status">
              <span>{selectedText.length < 58 ? `“${selectedText}”` : 'Passage geselecteerd'}</span>
              <Button
                size="sm"
                variant="outline"
                onClick={() => openChat(`Leg deze passage simpeler uit:\n\n“${selectedText}”`)}
              >
                <Sparkles size={14} /> Leg simpeler uit
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => openChat(`Maak één oefenvraag over deze passage:\n\n“${selectedText}”`)}
              >
                Maak oefenvraag
              </Button>
              <button type="button" onClick={() => setSelectedText('')} aria-label="Selectie sluiten">
                <X size={15} />
              </button>
            </div>
          )}
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

      <section className="chapter-practice">
        <button
          type="button"
          className="practice-card"
          onClick={() => setActivity('exercise')}
          data-testid="button-start-exercises"
        >
          <span className="practice-card-icon" aria-hidden="true"><PencilLine size={17} /></span>
          <span className="practice-card-body">
            <strong>Oefenvragen</strong>
            <span>
              {progress?.exerciseBestScore
                ? `Beste cijfer: ${progress.exerciseBestScore.toFixed(1)}`
                : 'Nog niet gemaakt'}
            </span>
          </span>
        </button>
        {chapter.isImportant && (
          <button
            type="button"
            className="practice-card"
            onClick={() => setActivity('exam')}
            data-testid="button-start-exam"
          >
            <span className="practice-card-icon" aria-hidden="true"><GraduationCap size={17} /></span>
            <span className="practice-card-body">
              <strong>Tentamen</strong>
              <span>
                {progress?.examBestScore
                  ? `Beste cijfer: ${progress.examBestScore.toFixed(1)}`
                  : 'Nog niet gemaakt'}
              </span>
            </span>
          </button>
        )}
      </section>

        </>
      )}

      </PageSections>

      <ChatPanel
        subjectId={subjectId}
        chapterId={chapterId}
        open={chatOpen}
        onClose={() => setChatOpen(false)}
        initialPrompt={chatPrompt}
        contextLabel={chapter.title}
      />
    </StudyPageShell>
  );
}
