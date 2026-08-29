export function ProgressBar({
  value,
  label,
}: {
  value: number;
  label?: string;
}) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div className="study-progress" data-testid="progress-bar">
      <div className="study-progress-head">
        <span>{label ?? 'Voortgang'}</span>
        <strong>{Math.round(clamped)}%</strong>
      </div>
      <div
        className="study-progress-track"
        role="progressbar"
        aria-valuenow={Math.round(clamped)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label ?? 'Voortgang'}
      >
        <div className="study-progress-fill" style={{ width: `${clamped}%` }} />
      </div>
    </div>
  );
}
