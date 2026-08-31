import { useEffect, useState } from 'react';
import {
  approveCrawlSubjectRequest,
  denyCrawlSubjectRequest,
  listCrawlSubjectRequests,
  requestCrawlSubjectRefinement,
  setCrawlSubjectBudget,
  type CrawlSubjectRequest,
} from '@workspace/api-client-react';
import { Check, Loader2, X } from 'lucide-react';
import { useLivePoll } from '@/lib/use-live-poll';
import { DetailSheet } from '@/components/admin/detail-sheet';
import { Button } from '@workspace/geslaagd-momentum/components/ui/button';
import { Input } from '@workspace/geslaagd-momentum/components/ui/input';
import { Label } from '@workspace/geslaagd-momentum/components/ui/label';
import { Textarea } from '@workspace/geslaagd-momentum/components/ui/textarea';
import { Badge } from '@workspace/geslaagd-momentum/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@workspace/geslaagd-momentum/components/ui/dialog';

function fmtDateTime(value: string | null) {
  if (!value) return 'onbekend';
  return new Date(value).toLocaleString('nl-NL', { dateStyle: 'medium', timeStyle: 'short' });
}

const requestStatusLabel: Record<CrawlSubjectRequest['status'], string> = {
  pending: 'In behandeling',
  approved: 'Goedgekeurd',
  denied: 'Afgewezen',
  needs_refinement: 'Aanpassing gevraagd',
};

type RefinementAction = { requestId: string; kind: 'deny' | 'refine' };

export function RequestsTab() {
  const [subjectRequests, setSubjectRequests] = useState<CrawlSubjectRequest[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');

  const [detailRequest, setDetailRequest] = useState<CrawlSubjectRequest | null>(null);
  const [refinement, setRefinement] = useState<RefinementAction | null>(null);
  const [adminNote, setAdminNote] = useState('');
  const [refining, setRefining] = useState(false);
  const [budgetDraft, setBudgetDraft] = useState('');
  const [savingBudget, setSavingBudget] = useState(false);

  useEffect(() => {
    setBudgetDraft(detailRequest?.creditBudget != null ? String(detailRequest.creditBudget) : '');
  }, [detailRequest?.id]);

  const load = async (silent = false) => {
    if (!silent) setState('loading');
    try {
      setSubjectRequests(await listCrawlSubjectRequests());
      setState('ready');
    } catch {
      setState('error');
    }
  };
  useEffect(() => { void load(); }, []);
  useLivePoll(() => load(true), { enabled: state === 'ready' });

  const approve = async (requestId: string) => {
    await approveCrawlSubjectRequest(requestId);
    setDetailRequest(null);
    await load();
  };

  const saveBudget = async () => {
    const subjectId = detailRequest?.subjectId;
    const value = Number(budgetDraft);
    if (!subjectId || !Number.isFinite(value) || value <= 0) return;
    setSavingBudget(true);
    try {
      await setCrawlSubjectBudget(subjectId, { creditBudget: value });
      await load();
    } finally {
      setSavingBudget(false);
    }
  };

  const openRefinement = (requestId: string, kind: RefinementAction['kind']) => {
    setRefinement({ requestId, kind });
    setAdminNote('');
  };
  const submitRefinement = async () => {
    if (!refinement || !adminNote.trim()) return;
    setRefining(true);
    try {
      if (refinement.kind === 'deny') {
        await denyCrawlSubjectRequest(refinement.requestId, { adminNote: adminNote.trim() });
      } else {
        await requestCrawlSubjectRefinement(refinement.requestId, { adminNote: adminNote.trim() });
      }
      setRefinement(null);
      setDetailRequest(null);
      await load();
    } finally {
      setRefining(false);
    }
  };

  return (
    <>
      {state === 'loading' ? (
        <p className="admin-empty"><Loader2 className="spin" size={15} /> Aanvragen laden…</p>
      ) : subjectRequests.length === 0 ? (
        <p className="admin-empty">Geen openstaande vakaanvragen.</p>
      ) : (
        <div className="account-list">
          {subjectRequests.map((request) => (
            <div key={request.id} className="account-row request-row">
              <button type="button" className="request-row-summary" onClick={() => setDetailRequest(request)}>
                <strong>{request.subjectName ?? 'Onbekend vak'}</strong>
                <span>{request.yearLevel === 'universitair' ? 'Universitair' : 'HAVO/VWO Bovenbouw'} · aangevraagd {fmtDateTime(request.createdAt)}</span>
              </button>
              <div className="request-row-actions">
                <Badge variant="secondary">{requestStatusLabel[request.status]}</Badge>
                {(request.status === 'pending' || request.status === 'needs_refinement') && (
                  <>
                    <Button variant="ghost" onClick={() => void approve(request.id)}><Check size={14} /> Goedkeuren</Button>
                    <Button variant="ghost" onClick={() => openRefinement(request.id, 'refine')}>Aanpassing vragen</Button>
                    <Button variant="ghost" onClick={() => openRefinement(request.id, 'deny')}><X size={14} /> Afwijzen</Button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <DetailSheet
        open={detailRequest !== null}
        onClose={() => setDetailRequest(null)}
        title={detailRequest?.subjectName ?? 'Onbekend vak'}
        description={
          detailRequest
            ? `${detailRequest.yearLevel === 'universitair' ? 'Universitair' : 'HAVO/VWO Bovenbouw'} · aangevraagd ${fmtDateTime(detailRequest.createdAt)}`
            : undefined
        }
        footer={
          (detailRequest?.status === 'pending' || detailRequest?.status === 'needs_refinement') && (
            <div className="request-row-actions">
              <Button variant="outline" onClick={() => void approve(detailRequest.id)}><Check size={14} /> Goedkeuren</Button>
              <Button variant="outline" onClick={() => openRefinement(detailRequest.id, 'refine')}>Aanpassing vragen</Button>
              <Button variant="outline" onClick={() => openRefinement(detailRequest.id, 'deny')}><X size={14} /> Afwijzen</Button>
            </div>
          )
        }
      >
        {detailRequest && (
          <div className="verkenner-card">
            <Badge variant="secondary">{requestStatusLabel[detailRequest.status]}</Badge>
            {detailRequest.description && (
              <p><strong>Beschrijving</strong><br />{detailRequest.description}</p>
            )}
            {detailRequest.emphasis && (
              <p><strong>Nadruk</strong><br />{detailRequest.emphasis}</p>
            )}
            {detailRequest.preferredSourceTypes && (
              <p><strong>Gewenste brontypes</strong><br />{detailRequest.preferredSourceTypes}</p>
            )}
            {detailRequest.subjectId && (
              <div>
                <Label htmlFor="request-budget-input">Zoekbudget</Label>
                <div className="request-row-actions">
                  <Input
                    id="request-budget-input"
                    type="number"
                    min={50}
                    max={2000}
                    value={budgetDraft}
                    onChange={(e) => setBudgetDraft(e.target.value)}
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={savingBudget || !budgetDraft || Number(budgetDraft) === detailRequest.creditBudget}
                    onClick={() => void saveBudget()}
                  >
                    {savingBudget ? <Loader2 className="spin" size={14} /> : null} Opslaan
                  </Button>
                </div>
              </div>
            )}
            {detailRequest.adminNote && (
              <p><strong>Toelichting aan student</strong><br />{detailRequest.adminNote}</p>
            )}
            {!detailRequest.description && !detailRequest.emphasis && !detailRequest.preferredSourceTypes && (
              <p className="study-hint">De student gaf verder geen toelichting bij deze aanvraag.</p>
            )}
          </div>
        )}
      </DetailSheet>

      <Dialog open={!!refinement} onOpenChange={(open) => { if (!open) setRefinement(null); }}>
        <DialogContent>
          {refinement && (
            <>
              <DialogHeader>
                <DialogTitle>{refinement.kind === 'deny' ? 'Vakaanvraag afwijzen' : 'Aanpassing vragen'}</DialogTitle>
                <DialogDescription>Deze toelichting is zichtbaar voor de student.</DialogDescription>
              </DialogHeader>
              <Textarea value={adminNote} maxLength={1000} onChange={(e) => setAdminNote(e.target.value)} placeholder="Toelichting…" />
              <DialogFooter>
                <Button variant="ghost" onClick={() => setRefinement(null)} disabled={refining}>Annuleren</Button>
                <Button onClick={() => void submitRefinement()} disabled={!adminNote.trim() || refining}>
                  {refining ? <Loader2 className="spin" size={14} /> : null} Versturen
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
