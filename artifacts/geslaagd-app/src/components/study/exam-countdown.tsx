import { CalendarClock } from 'lucide-react';

function daysUntil(examDate: string): number {
  const target = new Date(examDate);
  const today = new Date();
  target.setHours(0, 0, 0, 0);
  today.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

export function ExamCountdown({ examDate }: { examDate: string | null }) {
  if (!examDate) return null;
  const days = daysUntil(examDate);
  const formatted = new Date(examDate).toLocaleDateString('nl-NL', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  const message =
    days < 0
      ? 'Deze toets is geweest.'
      : days === 0
        ? 'Je toets is vandaag. Zet hem op!'
        : days === 1
          ? 'Nog 1 dag tot je toets.'
          : `Nog ${days} dagen tot je toets.`;

  return (
    <section className="exam-countdown" data-testid="exam-countdown">
      <CalendarClock size={16} aria-hidden="true" />
      <div>
        <strong>{message}</strong>
        <span>{formatted}</span>
      </div>
    </section>
  );
}
