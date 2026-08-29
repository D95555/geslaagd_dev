import { useEffect, useState, type FormEvent } from 'react';
import {
  getSubjectDetail,
  getSubjectProgress,
  getSubjectStudyPlan,
  scheduleSubjectExam,
  type ChapterProgress,
  type StudentProgress,
  type StudyPlanResponse,
  type SubjectDetail,
} from '@workspace/api-client-react';
import { Button } from '@workspace/geslaagd-momentum/components/ui/button';
import { Input } from '@workspace/geslaagd-momentum/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@workspace/geslaagd-momentum/components/ui/dialog';
import { Breadcrumbs } from '@workspace/geslaagd-momentum/components/layout/breadcrumbs';
import { PageHeader } from '@workspace/geslaagd-momentum/components/layout/page-header';
import { PageSections, Section } from '@workspace/geslaagd-momentum/components/layout/section';
import {
  ListSkeleton,
  PageSkeleton,
} from '@workspace/geslaagd-momentum/components/layout/page-skeleton';
import { CalendarPlus, MessageCircle, NotebookPen } from 'lucide-react';
import { useLocation } from 'wouter';
import { useAuth } from '@/auth/auth-context';
import { ChapterList } from '@/components/study/chapter-list';
import { ChatPanel } from '@/components/study/chat-panel';
import { ExamCountdown } from '@/components/study/exam-countdown';
import { ProgressBar } from '@/components/study/progress-bar';
import { ReviewPlan } from '@/components/study/review-plan';
import { StudyPageShell, StudyPageMessage } from '@/components/study/study-page-shell';
import { WeaknessCard } from '@/components/study/weakness-card';

export default function SubjectStudyPage({ subjectId }: { subjectId: string }) {
  const [, setLocation] = useLocation();
  const { user, isLoading } = useAuth();

  const [subject, setSubject] = useState<SubjectDetail | null>(null);
  const [progress, setProgress] = useState<StudentProgress | null>(null);
  const [plan, setPlan] = useState<StudyPlanResponse | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'unauthorized' | 'missing' | 'error'>(
    'loading',
  );
  const [chatOpen, setChatOpen] = useState(false);

  const [examOpen, setExamOpen] = useState(false);
  const [examDate, setExamDate] = useState('');
  const [examChapters, setExamChapters] = useState<string[]>([]);
  const [savingExam, setSavingExam] = useState(false);
  const [examNotice, setExamNotice] = useState('');

  const load = async () => {
    setState('loading');
    try {
      const detail = await getSubjectDetail(subjectId);
      setSubject(detail);
      // Progress and plan are per-student extras; a failure there should not
      // hide the subject itself.
      const [nextProgress, nextPlan] = await Promise.all([
        getSubjectProgress(subjectId).catch(() => null),
        getSubjectStudyPlan(subjectId).catch(() => null),
      ]);
      setProgress(nextProgress);
      setPlan(nextPlan);
      setState('ready');
    } catch (error) {
      const status = (error as { status?: number }).status;
      setState(status === 401 ? 'unauthorized' : status === 404 ? 'missing' : 'error');
    }
  };

  useEffect(() => {
    if (!isLoading && user) void load();
    else if (!isLoading) setState('unauthorized');
  }, [isLoading, user?.id, subjectId]);

  const saveExam = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!examDate) return;
    setSavingExam(true);
    setExamNotice('');
    try {
      await scheduleSubjectExam(subjectId, {
        examDate,
        chapterIds: examChapters,
        spacedRepetitionEnabled: true,
      });
      setExamOpen(false);
      await load();
    } catch {
      setExamNotice('De toetsdatum kon niet worden opgeslagen.');
    } finally {
      setSavingExam(false);
    }
  };

  if (state === 'unauthorized') {
    return (
      <StudyPageShell>
        <StudyPageMessage
          title="Log eerst in"
          body="Meld je aan om dit vak te bekijken."
          action={<Button onClick={() => setLocation('/auth')}>Inloggen</Button>}
        />
      </StudyPageShell>
    );
  }

  if (state === 'missing') {
    return (
      <StudyPageShell backTo="/vakken" backLabel="Terug naar de catalogus">
        <StudyPageMessage
          title="Vak niet gevonden"
          body="Dit vak bestaat niet of is nog niet gepubliceerd."
        />
      </StudyPageShell>
    );
  }

  if (state === 'loading' || !subject) {
    return (
      <StudyPageShell>
        <PageSkeleton label="Vak laden…">
          <ListSkeleton rows={5} />
        </PageSkeleton>
      </StudyPageShell>
    );
  }

  const progressByChapter = new Map<string, ChapterProgress>(
    (progress?.chapterProgress ?? []).map((row) => [row.chapterId, row]),
  );
  const weakTopics = progress?.weakTopics ?? [];

  return (
    <StudyPageShell>
      <PageSections>
        <PageHeader
          breadcrumbs={
            <Breadcrumbs
              onNavigate={setLocation}
              items={[
                { label: 'Mijn leeromgeving', href: '/mijn-leeromgeving' },
                { label: 'Vakken', href: '/vakken' },
                { label: subject.name },
              ]}
            />
          }
          kicker={
            <>
              <NotebookPen size={13} aria-hidden="true" />
              {subject.difficultyLevel ?? 'studiepakket'}
            </>
          }
          title={subject.name}
          description={subject.description ?? undefined}
          actions={
            <>
              <Button variant="outline" onClick={() => setExamOpen(true)}>
                <CalendarPlus size={15} /> Toetsdatum
              </Button>
              <Button onClick={() => setChatOpen(true)} data-testid="button-open-chat">
                <MessageCircle size={15} /> Vraag de assistent
              </Button>
            </>
          }
        />

        <div className="study-status">
          <ProgressBar value={progress?.subjectProgress ?? 0} label={`Voortgang ${subject.name}`} />
          <ExamCountdown examDate={plan?.examDate ?? null} />
        </div>

        {/* Chapters lead: opening one is what a student came here to do. The
            plan and weak spots inform that choice, so they follow it. */}
        <Section
          title="Hoofdstukken"
          actions={
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setLocation(`/vakken/${subjectId}/studieplan`)}
            >
              Bekijk studieplan
            </Button>
          }
        >
          <ChapterList
            chapters={subject.chapters}
            progress={progressByChapter}
            onOpen={(chapterId) => setLocation(`/vakken/${subjectId}/hoofdstuk/${chapterId}`)}
          />
        </Section>

        {(plan || weakTopics.length > 0) && (
          <div className="study-secondary">
            {plan && (
              <ReviewPlan
                tasks={plan.reviewTasks}
                onOpenChapter={(chapterId) =>
                  setLocation(`/vakken/${subjectId}/hoofdstuk/${chapterId}`)
                }
              />
            )}
            {weakTopics.length > 0 && <WeaknessCard topics={weakTopics} />}
          </div>
        )}
      </PageSections>

      <ChatPanel subjectId={subjectId} open={chatOpen} onClose={() => setChatOpen(false)} />

      <Dialog open={examOpen} onOpenChange={setExamOpen}>
        <DialogContent>
          <form onSubmit={saveExam}>
            <DialogHeader>
              <DialogTitle>Wanneer heb je je toets?</DialogTitle>
              <DialogDescription>
                Kies de datum en de hoofdstukken die de toets dekt. We maken dan een herhaalplan.
              </DialogDescription>
            </DialogHeader>

            <label className="exam-field">
              <span>Datum</span>
              <Input
                type="date"
                value={examDate}
                onChange={(event) => setExamDate(event.target.value)}
                required
              />
            </label>

            <fieldset className="exam-chapters">
              <legend>Hoofdstukken</legend>
              {subject.chapters.map((chapter) => (
                <label key={chapter.id}>
                  <input
                    type="checkbox"
                    checked={examChapters.includes(chapter.id)}
                    onChange={(event) =>
                      setExamChapters((current) =>
                        event.target.checked
                          ? [...current, chapter.id]
                          : current.filter((id) => id !== chapter.id),
                      )
                    }
                  />
                  <span>
                    {chapter.position}. {chapter.title}
                  </span>
                </label>
              ))}
            </fieldset>

            {examNotice && <p className="form-notice">{examNotice}</p>}

            <DialogFooter>
              <Button type="submit" disabled={savingExam || !examDate}>
                {savingExam ? 'Opslaan…' : 'Opslaan'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </StudyPageShell>
  );
}
