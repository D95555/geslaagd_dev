import { useEffect, useState } from 'react';
import {
  createCrawlSubject,
  listCrawlSubjects,
  runCrawl,
  type CrawlSubject,
} from '@workspace/api-client-react';
import { Loader2, Play, Plus } from 'lucide-react';
import { useLocation, useSearch } from 'wouter';
import { useAuth } from '@/auth/auth-context';
import { AdminDenied, AdminShell } from '@/components/admin/admin-shell';
import { Button } from '@workspace/geslaagd-momentum/components/ui/button';
import { Input } from '@workspace/geslaagd-momentum/components/ui/input';
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
import { CrawlsTab } from '@/components/admin/crawl/crawls-tab';
import { ReviewTab } from '@/components/admin/crawl/review-tab';
import { RequestsTab } from '@/components/admin/crawl/requests-tab';
import { MemoryTab } from '@/components/admin/crawl/memory-tab';
import { CostsTab } from '@/components/admin/crawl/costs-tab';

const TAB_VALUES = ['crawls', 'review', 'requests', 'memory', 'costs'] as const;
type Tab = (typeof TAB_VALUES)[number];

function tabFromSearch(search: string): Tab {
  const value = new URLSearchParams(search).get('tab');
  return (TAB_VALUES as readonly string[]).includes(value ?? '') ? (value as Tab) : 'crawls';
}

export default function AdminCrawlPage() {
  const [, setLocation] = useLocation();
  const search = useSearch();
  const { user, isLoading } = useAuth();
  const [state, setState] = useState<'loading' | 'ready' | 'forbidden'>('loading');
  const [activeSubjects, setActiveSubjects] = useState<CrawlSubject[]>([]);

  const [runOpen, setRunOpen] = useState(false);
  const [runSubjectId, setRunSubjectId] = useState<string>('');
  const [running, setRunning] = useState(false);
  const [runNotice, setRunNotice] = useState('');

  const [createOpen, setCreateOpen] = useState(false);
  const [newSubjectName, setNewSubjectName] = useState('');
  const [newSubjectYearLevel, setNewSubjectYearLevel] = useState<'havo_vwo_bovenbouw' | 'universitair'>('havo_vwo_bovenbouw');
  const [creating, setCreating] = useState(false);

  const loadSubjects = async () => {
    try {
      const subjects = await listCrawlSubjects();
      setActiveSubjects(subjects.filter((subject) => subject.status === 'active'));
      setState('ready');
    } catch (error) {
      setState((error as { status?: number }).status === 403 ? 'forbidden' : 'ready');
    }
  };
  useEffect(() => {
    if (!isLoading && user) void loadSubjects();
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
      setRunNotice(
        result.mode === 'curriculum'
          ? 'Curriculumontwerp gestart. Het vak wordt hoofdstuk voor hoofdstuk opgebouwd; volg de voortgang in de Contentpijplijn.'
          : `Verversing gestart voor ${result.tasksQueued} hoofdstukken. Het bestaande materiaal blijft zichtbaar tot de nieuwe versie klaar is.`,
      );
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
      await loadSubjects();
    } catch {
      // Kept open on failure so the admin can retry.
    } finally {
      setCreating(false);
    }
  };

  if (state === 'forbidden') return <AdminDenied />;

  return (
    <AdminShell
      title="Vakken & crawls"
      intro="Start crawls, keur nieuwe vakaanvragen goed, beoordeel twijfelgevallen en volg wat er is opgehaald."
    >
      <div className="crawl-toolbar">
        <Button onClick={openRunDialog} disabled={activeSubjects.length === 0}><Play size={15} /> Crawl starten</Button>
        <Button variant="outline" onClick={() => setCreateOpen(true)}><Plus size={15} /> Nieuw vak toevoegen</Button>
      </div>

      <Tabs
        value={tabFromSearch(search)}
        onValueChange={(value) => setLocation(value === 'crawls' ? '/beheer/crawl' : `/beheer/crawl?tab=${value}`)}
        className="admin-tabs"
      >
        <TabsList className="admin-tabs-list">
          <TabsTrigger value="crawls">Crawls</TabsTrigger>
          <TabsTrigger value="review">Beoordelen</TabsTrigger>
          <TabsTrigger value="requests">Vakaanvragen</TabsTrigger>
          <TabsTrigger value="memory">Geheugen</TabsTrigger>
          <TabsTrigger value="costs">Kosten</TabsTrigger>
        </TabsList>

        <TabsContent value="crawls"><CrawlsTab /></TabsContent>
        <TabsContent value="review"><ReviewTab /></TabsContent>
        <TabsContent value="requests"><RequestsTab /></TabsContent>
        <TabsContent value="memory"><MemoryTab /></TabsContent>
        <TabsContent value="costs"><CostsTab /></TabsContent>
      </Tabs>

      <Dialog open={runOpen} onOpenChange={setRunOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Crawl starten</DialogTitle>
            <DialogDescription>Kies een actief vak. Nog niet opgebouwde vakken krijgen een curriculumontwerp; al opgebouwde vakken worden ververst — alles via de reguliere pijplijn.</DialogDescription>
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
          <Select value={newSubjectYearLevel} onValueChange={(value) => setNewSubjectYearLevel(value as 'havo_vwo_bovenbouw' | 'universitair')}>
            <SelectTrigger aria-label="Niveau"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="havo_vwo_bovenbouw">HAVO/VWO Bovenbouw</SelectItem>
              <SelectItem value="universitair">Universitair</SelectItem>
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
    </AdminShell>
  );
}
