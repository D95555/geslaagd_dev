import type { VerkennerDecision } from '@workspace/api-client-react';
import { Badge } from '@workspace/geslaagd-momentum/components/ui/badge';
import { CircleCheck, CircleX } from 'lucide-react';

export function DecisionCard({ decision }: { decision: VerkennerDecision | null }) {
  if (!decision) {
    return (
      <div className="verkenner-card">
        <h3>Beslissing</h3>
        <p className="study-hint">Dit vak is direct door een beheerder aangemaakt, zonder aanvraagbeoordeling.</p>
      </div>
    );
  }

  return (
    <div className="verkenner-card">
      <h3>Beslissing</h3>
      <div className="verkenner-decision-head">
        {decision.approved === true && (
          <Badge variant="secondary">
            <CircleCheck size={13} /> Goedgekeurd
          </Badge>
        )}
        {decision.approved === false && (
          <Badge variant="destructive">
            <CircleX size={13} /> Afgewezen
          </Badge>
        )}
        {decision.model && <span className="study-hint">via {decision.model}</span>}
      </div>
      {decision.reason && <p>{decision.reason}</p>}
      {decision.suggestions && (
        <p className="study-hint">
          <strong>Suggesties:</strong> {decision.suggestions}
        </p>
      )}
      {decision.requestStatus && (
        <p className="study-hint">
          Aanvraagstatus: {decision.requestStatus}
          {decision.requestAdminNote ? ` — ${decision.requestAdminNote}` : ''}
        </p>
      )}
    </div>
  );
}
