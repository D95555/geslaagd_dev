import type { ExerciseQuestionPublic } from '@workspace/api-client-react';
import { Textarea } from '@workspace/geslaagd-momentum/components/ui/textarea';

export function QuestionRenderer({
  question,
  value,
  onChange,
  disabled,
}: {
  question: ExerciseQuestionPublic;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const inputName = `question-${question.index}`;

  return (
    <article className="question-card" data-testid={inputName}>
      <header>
        <span className="question-number">Vraag {question.index + 1}</span>
        <span className="question-points">
          {question.pointValue} {question.pointValue === 1 ? 'punt' : 'punten'}
        </span>
      </header>
      <p className="question-prompt">{question.prompt}</p>

      {question.type === 'mc' ? (
        <fieldset className="question-options" disabled={disabled}>
          <legend className="sr-only">Kies een antwoord</legend>
          {(question.options ?? []).map((option) => (
            <label key={option.key} className="question-option">
              <input
                type="radio"
                name={inputName}
                value={option.key}
                checked={value === option.key}
                onChange={(event) => onChange(event.target.value)}
              />
              <span>
                <strong>{option.key}.</strong> {option.text}
              </span>
            </label>
          ))}
        </fieldset>
      ) : (
        <Textarea
          value={value}
          onChange={(event) => onChange(event.target.value)}
          disabled={disabled}
          rows={5}
          placeholder="Schrijf hier je antwoord"
          aria-label={`Antwoord op vraag ${question.index + 1}`}
        />
      )}
    </article>
  );
}
