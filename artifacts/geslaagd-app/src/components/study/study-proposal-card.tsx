import { CheckCircle2, RefreshCw, Settings2, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { type StudyProposal, type StudyProposalAlternative } from '@workspace/api-client-react';
import { Button } from '@workspace/geslaagd-momentum/components/ui/button';
import { Card } from '@workspace/geslaagd-momentum/components/ui/card';
import { Input } from '@workspace/geslaagd-momentum/components/ui/input';

type Interpretation = StudyProposalAlternative;

export function StudyProposalCard({
  proposal,
  busy,
  onConfirm,
  onConfigure,
  onReject,
  onRetry,
}: {
  proposal: StudyProposal;
  busy: boolean;
  onConfirm: (interpretation: Interpretation, title: string) => Promise<void>;
  onConfigure: (interpretation: Interpretation, title: string) => void;
  onReject: () => Promise<void>;
  onRetry: () => Promise<void>;
}) {
  const interpretations = useMemo<Interpretation[]>(() => [{
    subjectId: proposal.subjectId,
    proposedSubject: proposal.proposedSubject,
    proposedTopic: proposal.proposedTopic,
    rationale: proposal.rationale,
  }, ...proposal.alternatives], [proposal]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [title, setTitle] = useState(proposal.proposedTopic);
  const selected = interpretations[selectedIndex] ?? interpretations[0];
  const percentage = Math.round(proposal.confidence * 100);
  const confidenceLabel = percentage >= 80 ? 'Hoge zekerheid' : percentage >= 65 ? 'Redelijke zekerheid' : 'Nog onzeker';

  useEffect(() => {
    setSelectedIndex(0);
    setTitle(proposal.proposedTopic);
  }, [proposal.id]);

  const choose = (index: number) => {
    setSelectedIndex(index);
    setTitle(interpretations[index]?.proposedTopic ?? proposal.proposedTopic);
  };

  return <Card className="proposal-card" aria-live="polite">
    <div className="proposal-heading">
      <div><span className="proposal-label">Voorstel van je studiecoach</span><h2>{selected.proposedTopic}</h2></div>
      <div className="confidence" title={`${percentage}% modelzekerheid; dit is geen inhoudelijke kwaliteitsgarantie`}>
        <span>{confidenceLabel}</span><strong>{percentage}%</strong>
        <div role="progressbar" aria-label="Zekerheid van de interpretatie" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percentage}><i style={{ width: `${percentage}%` }} /></div>
      </div>
    </div>
    <p><strong>{selected.proposedSubject}</strong> · {selected.rationale}</p>

    {proposal.clarificationQuestion && <div className="clarification"><strong>Nog één vraag om het scherper te maken:</strong><span>{proposal.clarificationQuestion}</span></div>}

    {interpretations.length > 1 && <fieldset className="interpretation-list">
      <legend>Welke interpretatie bedoel je?</legend>
      {interpretations.map((interpretation, index) => <label key={`${interpretation.proposedSubject}-${interpretation.proposedTopic}`} className={selectedIndex === index ? 'selected' : ''}>
        <input type="radio" name={`interpretation-${proposal.id}`} checked={selectedIndex === index} onChange={() => choose(index)} />
        <span><strong>{interpretation.proposedTopic}</strong><small>{interpretation.proposedSubject} — {interpretation.rationale}</small></span>
      </label>)}
    </fieldset>}

    <label className="proposal-title-input">
      <span>Naam van je studieplek — pas gerust aan</span>
      <Input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={160} />
    </label>

    <div className="proposal-tags">{proposal.searchTerms.map((term) => <span key={term}>{term}</span>)}</div>
    <div className="proposal-actions">
      <Button onClick={() => onConfirm(selected, title.trim() || selected.proposedTopic)} disabled={busy}><CheckCircle2 size={16} /> Bevestig en maak studieplek</Button>
      <Button className="quiet" variant="ghost" onClick={() => onConfigure(selected, title.trim() || selected.proposedTopic)} disabled={busy}><Settings2 size={15} /> Eerst instellen (niveau, bronnen)</Button>
      <Button className="quiet" variant="ghost" onClick={onRetry} disabled={busy}><RefreshCw size={15} /> Opnieuw proberen</Button>
      <Button className="danger-quiet" variant="ghost" onClick={onReject} disabled={busy}><Trash2 size={15} /> Afwijzen</Button>
    </div>
  </Card>;
}
