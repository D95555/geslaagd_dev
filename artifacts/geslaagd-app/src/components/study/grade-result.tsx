import type { GradeResult as GradeResultData, ExerciseQuestionPublic } from '@workspace/api-client-react';
import { Button } from '@workspace/geslaagd-momentum/components/ui/button';

export function GradeResult({
  result,
  questions,
  onRetry,
  onBack,
}: {
  result: GradeResultData;
  questions: ExerciseQuestionPublic[];
  onRetry: () => void;
  onBack: () => void;
}) {
  const promptByIndex = new Map(questions.map((question) => [question.index, question.prompt]));

  return (
    <section className="grade-result" data-testid="grade-result">
      <header className={result.passed ? 'grade-header passed' : 'grade-header failed'}>
        <div className="grade-number">{result.grade.toFixed(1)}</div>
        <div>
          <strong>{result.passed ? 'Voldoende' : 'Nog niet voldoende'}</strong>
          <span>
            {result.totalScore} van {result.maxScore} punten
          </span>
        </div>
      </header>

      <ol className="grade-feedback">
        {result.perQuestion.map((item) => (
          <li key={item.questionIndex} className={item.isCorrect ? 'correct' : 'incorrect'}>
            <div className="grade-feedback-head">
              <strong>Vraag {item.questionIndex + 1}</strong>
              <span>
                {item.score}/{item.maxScore}
              </span>
            </div>
            <p className="grade-question">{promptByIndex.get(item.questionIndex)}</p>
            <p className="grade-explanation">{item.feedback}</p>
            {item.correctAnswer && (
              <p className="grade-answer">
                <strong>Juiste antwoord:</strong> {item.correctAnswer}
              </p>
            )}
          </li>
        ))}
      </ol>

      <div className="grade-actions">
        <Button onClick={onRetry}>Opnieuw proberen</Button>
        <Button variant="outline" onClick={onBack}>
          Terug naar hoofdstuk
        </Button>
      </div>
    </section>
  );
}
