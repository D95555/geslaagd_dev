import { useEffect, useMemo, useState } from 'react';
import {
  cancelPipelineTask,
  getAdminSubjectContent,
  listCrawlSubjects,
  listPipelineTasks,
  publishSubject,
  retryPipelineTask,
  type AdminSubjectContentPreview,
  type CrawlSubject,
  type PipelineTask,
} from '@workspace/api-client-react';
import { Button } from '@workspace/geslaagd-momentum/components/ui/button';
import { Badge } from '@workspace/geslaagd-momentum/components/ui/badge';
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
import { Loader2, RefreshCw } from 'lucide-react';
import { useLocation } from 'wouter';
import { useAuth } from '@/auth/auth-context';
import { useLivePoll } from '@/lib/use-live-poll';
import {
  CrawlConfigForm,
  emptyCrawlConfig,
  toCrawlConfigPayload,
  type CrawlConfigDraft,
} from '@/components/admin/crawl-config-form';
import { TaskQueue } from '@/components/admin/task-queue';
import { TaskDetailSheet } from '@/components/admin/task-detail';
import { AdminDenied, AdminShell } from '@/components/admin/admin-shell';

type StatusFilter = 'all' | PipelineTask['status'];

export default function AdminPipelinePage() {
  const [, setLocation] = useLocation();
  const { user, isLoading } = useAuth();

  const [tasks, setTasks] = useState<PipelineTask[]>([]);
  const [subjects, setSubjects] = useState<CrawlSubject[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'forbidden' | 'error'>('loading');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [subjectFilter, setSubjectFilter] = useState<string>('all');
  const [busyTaskId, setBusyTaskId] = useState<string | null>(null);

  const [retryTask, setRetryTask] = useState<PipelineTask | null>(null);
  const [configDraft, setConfigDraft] = useState<CrawlConfigDraft>(emptyCrawlConfig);

  const [preview, setPreview] = useState<AdminSubjectContentPreview | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [notice, setNotice] = useState('');
  const [detailTaskId, setDetailTaskId] = useState<string | null>(null);

  // `silent` skips the loading state so background polling updates the task
  // list in place — this page is watched while the pipeline is running.
  const load = async (silent = false) => {
    if (!silent) setState('loading');
    try {
      const [nextTasks, nextSubjects] = await Promise.all([listPipelineTasks(), listCrawlSubjects()]);
      setTasks(nextTasks);
      setSubjects(nextSubjects);
      setState('ready');
    } catch (error) {
      setState((error as { status?: number }).status === 403 ? 'forbidden' : 'error');
      throw error;
    }
  };

  useEffect(() => {
    if (!isLoading && user) void load().catch(() => undefined);
    else if (!isLoading) setState('forbidden');
  }, [isLoading, user?.id]);

  useLivePoll(() => load(true), { enabled: state === 'ready' });

  const subjectNames = useMemo(
    () => new Map(subjects.map((subject) => [subject.id, subject.name])),
    [subjects],
  );

  const visibleTasks = useMemo(
    () =>
      tasks.filter(
        (task) =>
          (statusFilter === 'all' || task.status === statusFilter) &&
          (subjectFilter === 'all' || task.subjectId === subjectFilter),
      ),
    [tasks, statusFilter, subjectFilter],
  );

  const openRetry = (task: PipelineTask) => {
    setConfigDraft(emptyCrawlConfig);
    setRetryTask(task);
  };

  const confirmRetry = async (withConfig: boolean) => {
    if (!retryTask) return;
    setBusyTaskId(retryTask.id);
    try {
      await retryPipelineTask(
        retryTask.id,
        withConfig ? { config: toCrawlConfigPayload(configDraft) } : {},
      );
      setRetryTask(null);
      await load();
    } catch {
      setNotice('De taak kon niet opnieuw worden gestart.');
    } finally {
      setBusyTaskId(null);
    }
  };

  const cancel = async (task: PipelineTask) => {
    setBusyTaskId(task.id);
    try {
      await cancelPipelineTask(task.id);
      await load();
    } catch {
      setNotice('De taak kon niet worden geannuleerd.');
    } finally {
      setBusyTaskId(null);
    }
  };

  const openPreview = async (subjectId: string) => {
    setNotice('');
    try {
      setPreview(await getAdminSubjectContent(subjectId));
      setPreviewOpen(true);
    } catch {
      setNotice('De inhoud kon niet worden geladen.');
    }
  };

  const publish = async () => {
    if (!preview) return;
    setPublishing(true);
    try {
      await publishSubject(preview.subject.id);
      setPreviewOpen(false);
      setNotice(`${preview.subject.name} is gepubliceerd.`);
      await load();
    } catch (error) {
      setNotice(
        (error as { status?: number }).status === 409
          ? 'Dit vak is nog niet klaar om te publiceren.'
          : 'Publiceren is mislukt.',
      );
    } finally {
      setPublishing(false);
    }
  };

  if (state === 'forbidden') return <AdminDenied />;

  return (
    <AdminShell
      title="Contentpijplijn"
      intro="Volg hoe vakken van aanvraag naar gepubliceerd studiepakket gaan, en grijp in waar een stap vastloopt."
      actions={
        <Button variant="outline" size="sm" onClick={() => void load().catch(() => undefined)}>
          <RefreshCw size={15} /> Verversen
        </Button>
      }
    >
        {notice && <p className="admin-notice">{notice}</p>}

        <div className="pipeline-filters">
          <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as StatusFilter)}>
            <SelectTrigger className="pipeline-filter">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle statussen</SelectItem>
              <SelectItem value="waiting">Wacht</SelectItem>
              <SelectItem value="ready">Klaar om te draaien</SelectItem>
              <SelectItem value="running">Bezig</SelectItem>
              <SelectItem value="done">Klaar</SelectItem>
              <SelectItem value="failed">Mislukt</SelectItem>
            </SelectContent>
          </Select>

          <Select value={subjectFilter} onValueChange={setSubjectFilter}>
            <SelectTrigger className="pipeline-filter">
              <SelectValue placeholder="Vak" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle vakken</SelectItem>
              {subjects.map((subject) => (
                <SelectItem key={subject.id} value={subject.id}>
                  {subject.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {state === 'loading' ? (
          <p className="study-loading">
            <Loader2 className="spin" size={18} aria-hidden="true" /> Taken laden…
          </p>
        ) : state === 'error' ? (
          <div className="study-page-message">
            <p>De pijplijn kon niet worden geladen.</p>
            <Button onClick={() => void load().catch(() => undefined)}>Opnieuw proberen</Button>
          </div>
        ) : (
          <>
            <TaskQueue
              tasks={visibleTasks}
              subjectNames={subjectNames}
              onRetry={openRetry}
              onCancel={(task) => void cancel(task)}
              onOpen={(task) => setDetailTaskId(task.id)}
              busyTaskId={busyTaskId}
            />

            <div className="pipeline-subjects">
              <h2>Vakken</h2>
              <ul>
                {subjects.map((subject) => (
                  <li key={subject.id}>
                    <span>{subject.name}</span>
                    <Badge variant="outline">{subject.status}</Badge>
                    <Button variant="outline" size="sm" onClick={() => void openPreview(subject.id)}>
                      Inhoud bekijken
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          </>
        )}

      <Dialog open={retryTask !== null} onOpenChange={(open) => !open && setRetryTask(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Taak opnieuw starten</DialogTitle>
            <DialogDescription>
              De taak wordt opnieuw in de wachtrij gezet. Bij het verzamelen van bronnen kun je
              eerst de zoekinstellingen aanpassen.
            </DialogDescription>
          </DialogHeader>

          {retryTask?.taskType === 'source_gathering' && (
            <CrawlConfigForm value={configDraft} onChange={setConfigDraft} />
          )}

          <DialogFooter>
            {retryTask?.taskType === 'source_gathering' && (
              <Button
                variant="outline"
                disabled={busyTaskId !== null || !configDraft.queries.trim()}
                onClick={() => void confirmRetry(true)}
              >
                Met nieuwe instellingen
              </Button>
            )}
            <Button disabled={busyTaskId !== null} onClick={() => void confirmRetry(false)}>
              Opnieuw starten
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="preview-dialog">
          <DialogHeader>
            <DialogTitle>{preview?.subject.name}</DialogTitle>
            <DialogDescription>
              {preview?.subject.description ?? 'Nog geen vakbeschrijving.'}
            </DialogDescription>
          </DialogHeader>

          <div className="preview-body">
            <p>
              Status: <strong>{preview?.subject.publishStatus}</strong>
            </p>
            <ul className="preview-chapters">
              {preview?.chapters.map((entry) => (
                <li key={entry.chapter.id}>
                  <strong>
                    {entry.chapter.position}. {entry.chapter.title}
                  </strong>
                  <span>
                    {entry.content.length > 0
                      ? entry.content.map((item) => item.contentType).join(', ')
                      : 'nog geen inhoud'}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <DialogFooter>
            <Button
              disabled={publishing || preview?.subject.publishStatus === 'incomplete'}
              onClick={() => void publish()}
            >
              {publishing ? 'Publiceren…' : 'Publiceren'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <TaskDetailSheet taskId={detailTaskId} onClose={() => setDetailTaskId(null)} />
    </AdminShell>
  );
}
