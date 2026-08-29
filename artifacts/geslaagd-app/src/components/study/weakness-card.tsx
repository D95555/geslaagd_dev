import type { WeakTopic } from '@workspace/api-client-react';
import { Button } from '@workspace/geslaagd-momentum/components/ui/button';
import { TriangleAlert } from 'lucide-react';

export function WeaknessCard({
  topics,
  onPractice,
}: {
  topics: WeakTopic[];
  onPractice?: (topic: WeakTopic) => void;
}) {
  if (topics.length === 0) return null;

  return (
    <section className="weakness-card" data-testid="weakness-card">
      <header>
        <TriangleAlert size={16} aria-hidden="true" />
        <h3>Zwakke punten</h3>
      </header>
      <p className="weakness-intro">
        Deze onderwerpen gingen nog niet goed. Extra oefenen helpt hier het meest.
      </p>
      <ul>
        {topics.map((topic) => (
          <li key={topic.topicTag}>
            <div>
              <strong>{topic.topicTag}</strong>
              <span>
                {topic.totalCorrect}/{topic.totalAttempted} goed ·{' '}
                {Math.round(topic.successRate * 100)}%
              </span>
            </div>
            {onPractice && (
              <Button variant="outline" size="sm" onClick={() => onPractice(topic)}>
                Oefen meer
              </Button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
