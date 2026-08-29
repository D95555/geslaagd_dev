import { useEffect, useState } from 'react';
import {
  getChapterExam,
  getChapterExercises,
  submitChapterExam,
  submitChapterExercises,
  type ExerciseQuestionPublic,
  type GradeResult as GradeResultData,
} from '@workspace/api-client-react';
import { Button } from '@workspace/geslaagd-momentum/components/ui/button';
import { ArrowLeft, ArrowRight, Loader2 } from 'lucide-react';
import { GradeResult } from './grade-result';
import { QuestionRenderer } from './question-renderer';

type Mode = 'exercise' | 'exam';
type ViewState = 'loading' | 'ready' | 'empty' | 'error' | 'grading' | 'graded';

export function ExerciseView({
  subjectId,
  chapterId,
  mode,
  onBack,
}: {
  subjectId: string;
  chapterId: string;
  mode: Mode;
  onBack: () => void;
}) {
  const [questions, setQuestions] = useState<ExerciseQuestionPublic[]>([]);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [state, setState] = useState<ViewState>('loading');
  const [result, setResult] = useState<GradeResultData | null>(null);
  // Students choose between one question at a time or the whole set at once.
  const [oneAtATime, setOneAtATime] = useState(true);
  const [position, setPosition] = useState(0);

  const load = async () => {
    setState('loading');
    setResult(null);
    setAnswers({});
    setPosition(0);
    try {
      const set =
        mode === 'exercise'
          ? await getChapterExercises(subjectId, chapterId)
          : await getChapterExam(subjectId, chapterId);
      setQuestions(set.questions);
      setState(set.questions.length === 0 ? 'empty' : 'ready');
    } catch (error) {
      setState((error as { status?: number }).status === 404 ? 'empty' : 'error');
    }
  };

  useEffect(() => {
    void load();
  }, [subjectId, chapterId, mode]);

  const submit = async () => {
    setState('grading');
    try {
      const payload = {
        answers: questions.map((question) => ({
          questionIndex: question.index,
          answer: answers[question.index] ?? '',
        })),
      };
      const graded =
        mode === 'exercise'
          ? await submitChapterExercises(subjectId, chapterId, payload)
          : await submitChapterExam(subjectId, chapterId, payload);
      setResult(graded);
      setState('graded');
    } catch {
      setState('error');
    }
  };

  if (state === 'loading') {
    return (
      <div className="exercise-status">
        <Loader2 className="spin" size={20} aria-hidden="true" /> Vragen laden…
      </div>
    );
  }

  if (state === 'grading') {
    return (
      <div className="exercise-status">
        <Loader2 className="spin" size={20} aria-hidden="true" /> Je antwoorden worden nagekeken…
      </div>
    );
  }

  if (state === 'empty') {
    return (
      <div className="exercise-status">
        <p>
          {mode === 'exercise'
            ? 'Voor dit hoofdstuk zijn nog geen oefenvragen beschikbaar.'
            : 'Dit hoofdstuk heeft geen tentamen.'}
        </p>
        <Button variant="outline" onClick={onBack}>
          Terug
        </Button>
      </div>
    );
  }

  if (state === 'error') {
    return (
      <div className="exercise-status">
        <p>Er ging iets mis. Probeer het opnieuw.</p>
        <Button onClick={() => void load()}>Opnieuw laden</Button>
      </div>
    );
  }

  if (state === 'graded' && result) {
    return (
      <GradeResult result={result} questions={questions} onRetry={() => void load()} onBack={onBack} />
    );
  }

  const answeredCount = questions.filter((question) => (answers[question.index] ?? '').trim()).length;
  const visible = oneAtATime ? questions.slice(position, position + 1) : questions;

  return (
    <div className="exercise-view" data-testid="exercise-view">
      <header className="exercise-header">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft size={15} /> Terug
        </Button>
        <span>
          {answeredCount}/{questions.length} beantwoord
        </span>
        <Button variant="outline" size="sm" onClick={() => setOneAtATime((current) => !current)}>
          {oneAtATime ? 'Toon alles' : 'Eén tegelijk'}
        </Button>
      </header>

      {visible.map((question) => (
        <QuestionRenderer
          key={question.index}
          question={question}
          value={answers[question.index] ?? ''}
          onChange={(value) =>
            setAnswers((current) => ({ ...current, [question.index]: value }))
          }
        />
      ))}

      <footer className="exercise-footer">
        {oneAtATime && (
          <div className="exercise-nav">
            <Button
              variant="outline"
              size="sm"
              disabled={position === 0}
              onClick={() => setPosition((current) => Math.max(0, current - 1))}
            >
              <ArrowLeft size={15} /> Vorige
            </Button>
            <span>
              {position + 1} / {questions.length}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={position >= questions.length - 1}
              onClick={() => setPosition((current) => Math.min(questions.length - 1, current + 1))}
            >
              Volgende <ArrowRight size={15} />
            </Button>
          </div>
        )}
        <Button onClick={() => void submit()} data-testid="button-submit-answers">
          Inleveren en nakijken
        </Button>
      </footer>
    </div>
  );
}
