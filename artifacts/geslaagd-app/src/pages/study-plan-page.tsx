import { useEffect, useState } from 'react';
import {
  getSubjectDetail,
  getSubjectStudyPlan,
  type StudyPlanResponse,
  type SubjectDetail,
} from '@workspace/api-client-react';
import { Button } from '@workspace/geslaagd-momentum/components/ui/button';
import { CalendarDays, Loader2 } from 'lucide-react';
import { useLocation } from 'wouter';
import { useAuth } from '@/auth/auth-context';
import { ExamCountdown } from '@/components/study/exam-countdown';
import { ReviewPlan } from '@/components/study/review-plan';
import { StudyPageShell, StudyPageMessage } from '@/components/study/study-page-shell';

export default function StudyPlanPage({ subjectId }: { subjectId: string }) {
  const [, setLocation] = useLocation();
  const { user, isLoading } = useAuth();
  const [subject, setSubject] = useState<SubjectDetail | null>(null);
  const [plan, setPlan] = useState<StudyPlanResponse | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'unauthorized' | 'error'>('loading');

  const load = async () => {
    setState('loading');
    try {
      const [detail, nextPlan] = await Promise.all([
        getSubjectDetail(subjectId),
        getSubjectStudyPlan(subjectId),
      ]);
      setSubject(detail);
      setPlan(nextPlan);
      setState('ready');
    } catch (error) {
      setState((error as { status?: number }).status === 401 ? 'unauthorized' : 'error');
    }
  };

  useEffect(() => {
    if (!isLoading && user) void load();
    else if (!isLoading) setState('unauthorized');
  }, [isLoading, user?.id, subjectId]);

  if (state === 'unauthorized') {
    return (
      <StudyPageShell>
        <StudyPageMessage
          title="Log eerst in"
          body="Meld je aan om je studieplan te bekijken."
          action={<Button onClick={() => setLocation('/auth')}>Inloggen</Button>}
        />
      </StudyPageShell>
    );
  }

  return (
    <StudyPageShell backTo={`/vakken/${subjectId}`} backLabel="Terug naar het vak">
      <div className="study-hero">
        <div>
          <span className="study-kicker">
            <CalendarDays size={15} /> studieplan
          </span>
          <h1>{subject ? `Studieplan ${subject.name}` : 'Studieplan'}</h1>
          <p>Wat je vandaag het beste kunt herhalen, op volgorde van belang.</p>
        </div>
      </div>

      {state === 'loading' && (
        <p className="study-loading">
          <Loader2 className="spin" size={18} aria-hidden="true" /> Studieplan laden…
        </p>
      )}

      {state === 'error' && (
        <div className="study-page-message">
          <p>Het studieplan kon niet worden geladen.</p>
          <Button onClick={() => void load()}>Opnieuw proberen</Button>
        </div>
      )}

      {state === 'ready' && plan && (
        <>
          <ExamCountdown examDate={plan.examDate} />
          {!plan.examDate && (
            <p className="study-hint">
              Stel een toetsdatum in bij het vak, dan verdelen we de stof over de dagen die je nog hebt.
            </p>
          )}
          <ReviewPlan
            tasks={plan.reviewTasks}
            onOpenChapter={(chapterId) =>
              setLocation(`/vakken/${subjectId}/hoofdstuk/${chapterId}`)
            }
          />
        </>
      )}
    </StudyPageShell>
  );
}
