import { useEffect, useState } from 'react';
import {
  approveCrawlSubjectRequest,
  createCrawlSubject,
  denyCrawlSubjectRequest,
  listCrawlSubjectRequests,
  listCrawlSubjects,
  listCrawls,
  requestCrawlSubjectRefinement,
  runCrawl,
  type CrawlSubject,
  type CrawlSubjectRequest,
  type CrawlSummary,
} from '@workspace/api-client-react';
import { ArrowLeft, Check, Loader2, Play, Plus, ShieldAlert, X } from 'lucide-react';
import { useLocation } from 'wouter';
import { useAuth } from '@/auth/auth-context';
import { CrawlCharts } from '@/components/admin/crawl-charts';
import { Button } from '@workspace/geslaagd-momentum/components/ui/button';
import { Input } from '@workspace/geslaagd-momentum/components/ui/input';
import { Textarea } from '@workspace/geslaagd-momentum/components/ui/textarea';
import { Badge } from '@workspace/geslaagd-momentum/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@workspace/geslaagd-momentum/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@workspace/geslaagd-momentum/components/ui/select';
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

const crawlStatusLabel: Record<CrawlSummary['status'], string> = {
  running: 'Bezig',
  complete: 'Voltooid',
  failed: 'Mislukt',
};

type RefinementAction = { requestId: string; kind: 'deny' | 'refine' };

export default function AdminCrawlPage() {
  const [, setLocation] = useLocation();
  const { user, isLoading } = useAuth();

  const [crawls, setCrawls] = useState<CrawlSummary[]>([]);
  const [subjectRequests, setSubjectRequests] = useState<CrawlSubjectRequest[]>([]);
  const [activeSubjects, setActiveSubjects] = useState<CrawlSubject[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'forbidden' | 'error'>('loading');

  const [runOpen, setRunOpen] = useState(false);
  const [runSubjectId, setRunSubjectId] = useState<string>('');
  const [running, setRunning] = useState(false);
  const [runNotice, setRunNotice] = useState('');

  const [createOpen, setCreateOpen] = useState(false);
  const [newSubjectName, setNewSubjectName] = useState('');
  const [newSubjectYearLevel, setNewSubjectYearLevel] = useState<'vwo' | 'bachelor1'>('vwo');
  const [creating, setCreating] = useState(false);

  const [refinement, setRefinement] = useState<RefinementAction | null>(null);
  const [adminNote, setAdminNote] = useState('');
  const [refining, setRefining] = useState(false);

  const load = async () => {
    setState('loading');
    try {
      const [nextCrawls, nextRequests, subjects] = await Promise.all([
        listCrawls(),
        listCrawlSubjectRequests(),
        listCrawlSubjects(),
      ]);
      setCrawls(nextCrawls);
      setSubjectRequests(nextRequests);
      setActiveSubjects(subjects.filter((subject) => subject.status === 'active'));
      setState('ready');
    } catch (error) {
      setState((error as { status?: number }).status === 403 ? 'forbidden' : 'error');
    }
  };
  useEffect(() => {
    if (!isLoading && user) void load();
    else if (!isLoading) setState('forbidden');
  }, [isLoading, user?.id]);

  const openRunDialog = () => {
    setRunSubjectId(activeSubjects[0]?.id ?? '');
    setRunNotice('');
    setRunOpen(true);
  };
  const submitRun = async () => {
    if (!runSubjectId) return;
    setRunning(true);
    setRunNotice('');
    try {
      const result = await runCrawl({ subjectId: runSubjectId });
      setRunNotice(`Crawl voltooid: ${result.sourcesAccepted}/${result.sourcesFound} bronnen geaccepteerd.`);
      await load();
    } catch {
      setRunNotice('De crawl kon niet worden gestart of is mislukt.');
    } finally {
      setRunning(false);
    }
  };

  const submitCreateSubject = async () => {
    const trimmed = newSubjectName.trim();
    if (!trimmed) return;
    setCreating(true);
    try {
      await createCrawlSubject({ name: trimmed, year_level: newSubjectYearLevel });
      setNewSubjectName('');
      setCreateOpen(false);
      await load();
    } catch {
      // Kept open on failure so the admin can retry.
    } finally {
      setCreating(false);
    }
  };

  const approve = async (requestId: string) => {
    await approveCrawlSubjectRequest(requestId);
    await load();
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
      await load();
    } finally {
      setRefining(false);
    }
  };

  if (state === 'forbidden') {
    return (
      <main className="admin-denied">
        <ShieldAlert size={29} />
        <h1>Geen toegang.</h1>
        <p>Deze omgeving is alleen voor beheerders.</p>
        <Button onClick={() => setLocation('/beheer')}>Terug naar beheer</Button>
      </main>
    );
  }

  return (
    <main className="admin-page">
      <header className="admin-header">
        <button className="auth-brand" onClick={() => setLocation('/beheer')}>
          <span className="wordmark-mark" /><span>geslaagd.app</span>
        </button>
        <div>
          <span>bronnen crawl</span>
          <Button variant="ghost" onClick={() => setLocation('/beheer')}><ArrowLeft size={15} /> Terug naar beheer</Button>
        </div>
      </header>
      <section className="admin-wrap">
        <div className="admin-intro">
          <p className="dashboard-kicker"><ShieldAlert size={15} /> bronnenpijplijn</p>
          <h1>Crawl studiebronnen.</h1>
          <p>Start crawls, keur nieuwe vakken goed en beoordeel gevonden bronnen.</p>
        </div>

        <div className="crawl-toolbar">
          <Button onClick={openRunDialog} disabled={activeSubjects.length === 0}><Play size={15} /> Crawl starten</Button>
          <Button variant="outline" onClick={() => setCreateOpen(true)}><Plus size={15} /> Nieuw vak toevoegen</Button>
          <Button variant="ghost" onClick={() => setLocation('/beheer/crawl/pending')}>Wachtrij bekijken</Button>
        </div>

        <Tabs defaultValue="crawls" className="admin-tabs">
          <TabsList className="admin-tabs-list">
            <TabsTrigger value="crawls">Crawls</TabsTrigger>
            <TabsTrigger value="requests">Vakaanvragen</TabsTrigger>
          </TabsList>

          <TabsContent value="crawls">
            {state === 'loading' ? (
              <p className="admin-empty"><Loader2 className="spin" size={15} /> Crawls laden…</p>
            ) : state === 'error' ? (
              <p className="admin-empty">Crawls konden niet geladen worden.</p>
            ) : crawls.length === 0 ? (
              <p className="admin-empty">Nog geen crawls uitgevoerd.</p>
            ) : (
              <>
              <CrawlCharts crawls={crawls} />
              <div className="account-list">
                {crawls.map((crawl) => (
                  <button
                    key={crawl.id}
                    className="account-row crawl-row"
                    onClick={() => setLocation(`/beheer/crawl/${crawl.id}`)}
                  >
                    <div>
                      <strong>{crawl.subjectName}</strong>
                      <span>
                        {fmtDateTime(crawl.createdAt)} · {crawl.sourcesFound ?? 0} gevonden · {crawl.sourcesAccepted ?? 0} geaccepteerd
                        {crawl.creditsUsed !== null ? ` · ${crawl.creditsUsed} credits` : ''}
                        {crawl.efficiencyRatio !== null ? ` · efficiëntie ${crawl.efficiencyRatio.toFixed(2)}` : ''}
                      </span>
                    </div>
                    <Badge variant={crawl.status === 'failed' ? 'destructive' : crawl.status === 'running' ? 'secondary' : 'default'}>
                      {crawlStatusLabel[crawl.status]}
                    </Badge>
                  </button>
                ))}
              </div>
              </>
            )}
          </TabsContent>

          <TabsContent value="requests">
            {state === 'loading' ? (
              <p className="admin-empty"><Loader2 className="spin" size={15} /> Aanvragen laden…</p>
            ) : subjectRequests.length === 0 ? (
              <p className="admin-empty">Geen openstaande vakaanvragen.</p>
            ) : (
              <div className="account-list">
                {subjectRequests.map((request) => (
                  <div key={request.id} className="account-row request-row">
                    <div>
                      <strong>{request.subjectName ?? 'Onbekend vak'}</strong>
                      <span>{request.yearLevel === 'bachelor1' ? 'Eerstejaars bachelor' : '6 VWO'} · aangevraagd {fmtDateTime(request.createdAt)}</span>
                    </div>
                    <div className="request-row-actions">
                      <Badge variant="secondary">{requestStatusLabel[request.status]}</Badge>
                      {request.status === 'pending' && (
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
          </TabsContent>
        </Tabs>
      </section>

      <Dialog open={runOpen} onOpenChange={setRunOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Crawl starten</DialogTitle>
            <DialogDescription>Kies een actief vak om de sourceCrawler/sourceHandler-pijplijn voor te starten.</DialogDescription>
          </DialogHeader>
          <Select value={runSubjectId} onValueChange={setRunSubjectId}>
            <SelectTrigger aria-label="Vak"><SelectValue placeholder="Kies een vak" /></SelectTrigger>
            <SelectContent>
              {activeSubjects.map((subject) => (
                <SelectItem key={subject.id} value={subject.id}>{subject.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {runNotice && <p className="admin-notice">{runNotice}</p>}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRunOpen(false)} disabled={running}>Sluiten</Button>
            <Button onClick={() => void submitRun()} disabled={!runSubjectId || running}>
              {running ? <Loader2 className="spin" size={14} /> : <Play size={14} />} Starten
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nieuw vak toevoegen</DialogTitle>
            <DialogDescription>Maakt direct een actief vak aan, zonder studentaanvraag.</DialogDescription>
          </DialogHeader>
          <Input value={newSubjectName} maxLength={160} onChange={(e) => setNewSubjectName(e.target.value)} placeholder="Vaknaam" />
          <Select value={newSubjectYearLevel} onValueChange={(value) => setNewSubjectYearLevel(value as 'vwo' | 'bachelor1')}>
            <SelectTrigger aria-label="Niveau"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="vwo">6 VWO</SelectItem>
              <SelectItem value="bachelor1">Eerstejaars bachelor</SelectItem>
            </SelectContent>
          </Select>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCreateOpen(false)} disabled={creating}>Annuleren</Button>
            <Button onClick={() => void submitCreateSubject()} disabled={!newSubjectName.trim() || creating}>
              {creating ? <Loader2 className="spin" size={14} /> : <Plus size={14} />} Toevoegen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
    </main>
  );
}
