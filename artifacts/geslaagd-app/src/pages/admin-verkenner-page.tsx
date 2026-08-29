import { useEffect, useState } from 'react';
import {
  getVerkennerSubject,
  listVerkennerSubjects,
  lookupVerkennerObject,
  updateVerkennerChapterTitle,
  updateVerkennerSubjectTitle,
  type VerkennerSubjectDetailResponse,
  type VerkennerSubjectSummary,
} from '@workspace/api-client-react';
import { Badge } from '@workspace/geslaagd-momentum/components/ui/badge';
import { Button } from '@workspace/geslaagd-momentum/components/ui/button';
import { Input } from '@workspace/geslaagd-momentum/components/ui/input';
import { Loader2, Search } from 'lucide-react';
import { useAuth } from '@/auth/auth-context';
import { AdminDenied, AdminShell } from '@/components/admin/admin-shell';
import { InlineEditableTitle } from '@/components/admin/verkenner/inline-editable-title';
import { OBJECT_TYPE_META, type VerkennerObjectType } from '@/components/admin/verkenner/object-type-meta';
import { DecisionCard } from '@/components/admin/verkenner/decision-card';
import { CurriculumTree } from '@/components/admin/verkenner/curriculum-tree';
import { ObjectPanel } from '@/components/admin/verkenner/object-panel';

export default function AdminVerkennerPage() {
  const { user, isLoading } = useAuth();

  const [state, setState] = useState<'loading' | 'ready' | 'forbidden' | 'error'>('loading');
  const [subjects, setSubjects] = useState<VerkennerSubjectSummary[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSubjectId, setSelectedSubjectId] = useState<string | null>(null);
  const [detail, setDetail] = useState<VerkennerSubjectDetailResponse | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const [lookupTerm, setLookupTerm] = useState('');
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [lookupBusy, setLookupBusy] = useState(false);

  const [panelObject, setPanelObject] = useState<{ type: Exclude<VerkennerObjectType, 'subject'>; id: string } | null>(
    null,
  );

  const loadSubjects = async (q?: string) => {
    try {
      const result = await listVerkennerSubjects(q ? { q } : undefined);
      setSubjects(result.subjects);
      setState('ready');
      if (!selectedSubjectId && result.subjects[0]) {
        setSelectedSubjectId(result.subjects[0].id);
      }
    } catch (error) {
      setState((error as { status?: number }).status === 403 ? 'forbidden' : 'error');
    }
  };

  useEffect(() => {
    if (!isLoading && user) void loadSubjects();
    else if (!isLoading) setState('forbidden');
  }, [isLoading, user?.id]);

  useEffect(() => {
    const handle = setTimeout(() => {
      if (state === 'ready') void loadSubjects(searchTerm || undefined);
    }, 250);
    return () => clearTimeout(handle);
  }, [searchTerm]);

  const loadDetail = async (subjectId: string) => {
    setSelectedSubjectId(subjectId);
    setPanelObject(null);
    setDetailLoading(true);
    try {
      setDetail(await getVerkennerSubject(subjectId));
    } catch {
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  };

  useEffect(() => {
    if (selectedSubjectId) void loadDetail(selectedSubjectId);
  }, [selectedSubjectId]);

  const renameSubject = async (name: string) => {
    if (!selectedSubjectId) return;
    await updateVerkennerSubjectTitle(selectedSubjectId, { name });
    await loadDetail(selectedSubjectId);
    await loadSubjects(searchTerm || undefined);
  };

  const renameChapter = async (chapterId: string, title: string) => {
    await updateVerkennerChapterTitle(chapterId, { title });
    if (selectedSubjectId) await loadDetail(selectedSubjectId);
  };

  const runLookup = async () => {
    const q = lookupTerm.trim();
    if (!q) return;
    setLookupBusy(true);
    setLookupError(null);
    try {
      const result = await lookupVerkennerObject({ q });
      setSelectedSubjectId(result.subjectId);
      if (result.type !== 'subject') {
        setPanelObject({ type: result.type, id: result.id });
      }
      setLookupTerm('');
    } catch {
      setLookupError('Niets gevonden voor deze zoekterm.');
    } finally {
      setLookupBusy(false);
    }
  };

  if (state === 'forbidden') return <AdminDenied />;

  return (
    <AdminShell title="Verkenner" intro="Zoek een vak op en zie alles wat eraan hangt.">
      {state === 'loading' && (
        <p className="study-loading">
          <Loader2 className="spin" size={18} aria-hidden="true" /> Laden…
        </p>
      )}
      {state === 'error' && <p className="admin-notice is-error">De Verkenner kon niet worden geladen.</p>}

      {state === 'ready' && (
        <div className="verkenner-layout">
          <aside className="verkenner-sidebar">
            <div className="verkenner-search">
              <Search size={15} aria-hidden="true" />
              <Input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Zoek op naam of id"
              />
            </div>
            <ul className="verkenner-subject-list">
              {subjects.map((subject) => {
                const Icon = OBJECT_TYPE_META.subject.icon;
                return (
                  <li key={subject.id}>
                    <button
                      type="button"
                      className={subject.id === selectedSubjectId ? 'verkenner-subject-item active' : 'verkenner-subject-item'}
                      onClick={() => setSelectedSubjectId(subject.id)}
                    >
                      <Icon size={14} aria-hidden="true" />
                      <span>{subject.name}</span>
                      <Badge variant="secondary">{subject.status}</Badge>
                    </button>
                  </li>
                );
              })}
              {subjects.length === 0 && <li className="study-hint">Geen vakken gevonden.</li>}
            </ul>

            <div className="verkenner-lookup">
              <label htmlFor="verkenner-lookup-input">Spring naar object</label>
              <div className="verkenner-lookup-row">
                <Input
                  id="verkenner-lookup-input"
                  value={lookupTerm}
                  onChange={(e) => setLookupTerm(e.target.value)}
                  placeholder="Plak een id of bron-URL"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void runLookup();
                  }}
                />
                <Button size="sm" onClick={() => void runLookup()} disabled={lookupBusy}>
                  {lookupBusy ? <Loader2 className="spin" size={14} /> : 'Ga'}
                </Button>
              </div>
              {lookupError && <span className="admin-notice is-error">{lookupError}</span>}
            </div>
          </aside>

          <section className="verkenner-detail">
            {detailLoading && (
              <p className="study-loading">
                <Loader2 className="spin" size={18} aria-hidden="true" /> Vak laden…
              </p>
            )}
            {!detailLoading && detail && (
              <>
                <header className="verkenner-detail-head">
                  <InlineEditableTitle value={detail.subject.name} onSave={renameSubject} className="verkenner-detail-title" />
                  <div className="verkenner-detail-badges">
                    <Badge variant="secondary">{detail.subject.status}</Badge>
                    <Badge variant="secondary">{detail.subject.publishStatus}</Badge>
                    <Badge variant="secondary">
                      {detail.subject.yearLevel === 'havo_vwo_bovenbouw' ? 'HAVO/VWO Bovenbouw' : 'Universitair'}
                    </Badge>
                    <code className="verkenner-id">{detail.subject.id}</code>
                  </div>
                  {detail.subject.description && <p>{detail.subject.description}</p>}
                </header>

                <DecisionCard decision={detail.decision} />
                <CurriculumTree
                  chapters={detail.chapters}
                  onSelectContent={(contentId) => setPanelObject({ type: 'content', id: contentId })}
                  onRenameChapter={renameChapter}
                />

                {detail.crawls.length > 0 && (
                  <div className="verkenner-card">
                    <h3>Crawls</h3>
                    <ul className="verkenner-flat-list">
                      {detail.crawls.map((crawl) => (
                        <li key={crawl.id}>
                          <button type="button" onClick={() => setPanelObject({ type: 'crawl', id: crawl.id })}>
                            {crawl.status} · {crawl.sourcesAccepted}/{crawl.sourcesFound} bronnen
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {detail.tasks.length > 0 && (
                  <div className="verkenner-card">
                    <h3>Taken</h3>
                    <ul className="verkenner-flat-list">
                      {detail.tasks.map((task) => (
                        <li key={task.id}>
                          <button type="button" onClick={() => setPanelObject({ type: 'task', id: task.id })}>
                            {task.taskType} <Badge variant={task.status === 'done' ? 'secondary' : 'destructive'}>{task.status}</Badge>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            )}
          </section>

          {panelObject && (
            <ObjectPanel type={panelObject.type} id={panelObject.id} onClose={() => setPanelObject(null)} />
          )}
        </div>
      )}
    </AdminShell>
  );
}
