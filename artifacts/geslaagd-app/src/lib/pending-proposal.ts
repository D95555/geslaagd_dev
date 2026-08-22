const pendingProposalKey = 'geslaagd.pending-proposal';

export type PendingProposal = {
  proposalId: string;
  subjectId: string | null;
  proposedSubject: string;
  proposedTopic: string;
  rationale: string;
  searchTerms: string[];
};

export function savePendingProposal(proposal: PendingProposal): void {
  window.sessionStorage.setItem(pendingProposalKey, JSON.stringify(proposal));
}

export function takePendingProposal(): PendingProposal | null {
  const raw = window.sessionStorage.getItem(pendingProposalKey);
  window.sessionStorage.removeItem(pendingProposalKey);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<PendingProposal>;
    if (!parsed.proposalId || !parsed.proposedSubject || !parsed.proposedTopic) return null;
    return {
      proposalId: parsed.proposalId,
      subjectId: parsed.subjectId ?? null,
      proposedSubject: parsed.proposedSubject,
      proposedTopic: parsed.proposedTopic,
      rationale: parsed.rationale ?? '',
      searchTerms: Array.isArray(parsed.searchTerms) ? parsed.searchTerms.filter((term): term is string => typeof term === 'string') : [],
    };
  } catch {
    return null;
  }
}
