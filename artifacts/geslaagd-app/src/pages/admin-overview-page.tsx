import { useEffect, useState } from 'react';
import {
  listCrawlSubjectRequests,
  listCrawlSubjects,
  listPendingSources,
  listPipelineTasks,
  type CrawlSubject,
  type PipelineTask,
} from '@workspace/api-client-react';
import { Button } from '@workspace/geslaagd-momentum/components/ui/button';
import { NumberTicker } from '@/components/ui/number-ticker';
import { Loader2, RefreshCw } from 'lucide-react';
import { useLocation } from 'wouter';
import { useAuth } from '@/auth/auth-context';
import { AdminDenied, AdminShell } from '@/components/admin/admin-shell';
import { TaskDetailSheet } from '@/components/admin/task-detail';
import { useLivePoll } from '@/lib/use-live-poll';

type Attention = {
  label: string;
  count: number;
  href: string;
  detail: string;
  urgent: boolean;
};

export default function AdminOverviewPage() {
  const [, setLocation] = useLocation();
  const { user, isLoading } = useAuth();
  const [items, setItems] = useState<Attention[]>([]);
  const [subjects, setSubjects] = useState<CrawlSubject[]>([]);
  const [tasks, setTasks] = useState<PipelineTask[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'forbidden' | 'error'>('loading');
  const [detailTaskId, setDetailTaskId] = useState<string | null>(null);

  // `silent` keeps the spinner away during background polling, so the page
  // updates in place instead of flashing every few seconds.
  const load = async (silent = false) => {
    if (!silent) setState('loading');
    try {
      const [nextTasks, nextSubjects, pending, requests] = await Promise.all([
        listPipelineTasks(),
        listCrawlSubjects(),
        listPendingSources(),
        listCrawlSubjectRequests(),
      ]);
      setTasks(nextTasks);
      setSubjects(nextSubjects);

      const failed = nextTasks.filter((task) => task.status === 'failed').length;
      const running = nextTasks.filter(
        (task) => task.status === 'running' || task.status === 'ready',
      ).length;

      setItems([
        {
          label: 'Mislukte taken',
          count: failed,
          href: '/beheer/pipeline',
          detail: 'Taken die na drie pogingen zijn gestopt',
          urgent: failed > 0,
        },
        {
          label: 'Bronnen te beoordelen',
          count: pending.length,
          href: '/beheer/crawl?tab=review',
          detail: 'De scorer twijfelde en wacht op jouw oordeel',
          urgent: pending.length > 0,
        },
        {
          label: 'Openstaande vakaanvragen',
          count: requests.length,
          href: '/beheer/crawl',
          detail: 'Aanvragen van studenten',
          urgent: false,
        },
        {
          label: 'Taken in behandeling',
          count: running,
          href: '/beheer/pipeline',
          detail: 'De pijplijn is hiermee bezig',
          urgent: false,
        },
      ]);
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

  if (state === 'forbidden') return <AdminDenied />;

  // A subject is only publishable once the readiness check has passed.
  const readyToPublish = subjects.filter((subject) => subject.publishStatus === 'ready');

  return (
    <AdminShell
      title="Overzicht"
      intro="Wat er nu aandacht vraagt, en waar je het vindt."
      actions={
        <Button variant="outline" size="sm" onClick={() => void load().catch(() => undefined)}>
          <RefreshCw size={15} /> Verversen
        </Button>
      }
    >
      {state === 'loading' && (
        <p className="study-loading">
          <Loader2 className="spin" size={18} aria-hidden="true" /> Laden…
        </p>
      )}

      {state === 'error' && (
        <div className="study-page-message">
          <p>Het overzicht kon niet worden geladen.</p>
          <Button onClick={() => void load().catch(() => undefined)}>Opnieuw proberen</Button>
        </div>
      )}

      {state === 'ready' && (
        <>
          <ul className="attention-grid" data-testid="attention-grid">
            {items.map((item) => (
              <li key={item.label}>
                <button
                  type="button"
                  className={item.urgent && item.count > 0 ? 'attention-card urgent' : 'attention-card'}
                  onClick={() => setLocation(item.href)}
                >
                  <NumberTicker
                    value={item.count}
                    className="attention-count text-inherit tracking-normal dark:text-inherit"
                  />
                  <span className="attention-label">{item.label}</span>
                  <span className="attention-detail">{item.detail}</span>
                </button>
              </li>
            ))}
          </ul>

          <section className="admin-block">
            <h2>Vakken klaar om te publiceren</h2>
            {readyToPublish.length === 0 ? (
              <p className="admin-empty">
                Geen enkel vak heeft de gereedheidscontrole doorstaan. Zodra de pijplijn een vak
                afrondt, verschijnt het hier.
              </p>
            ) : (
              <ul className="pipeline-subjects">
                {readyToPublish.map((subject) => (
                  <li key={subject.id}>
                    <span>{subject.name}</span>
                    <Button variant="outline" size="sm" onClick={() => setLocation('/beheer/pipeline')}>
                      Bekijken en publiceren
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="admin-block">
            <h2>Laatste taken</h2>
            {tasks.length === 0 ? (
              <p className="admin-empty">
                De pijplijn heeft nog niets gedaan. Zodra een student een vak aanvraagt, start de
                beoordeling automatisch.
              </p>
            ) : (
              <ul className="recent-tasks">
                {tasks.slice(0, 8).map((task) => (
                  <li key={task.id}>
                    <button type="button" onClick={() => setDetailTaskId(task.id)}>
                      <span className={`task-dot task-dot-${task.status}`} aria-hidden="true" />
                      <span className="recent-task-type">{task.taskType}</span>
                      <span className="recent-task-status">{task.status}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}

      <TaskDetailSheet taskId={detailTaskId} onClose={() => setDetailTaskId(null)} />
    </AdminShell>
  );
}
