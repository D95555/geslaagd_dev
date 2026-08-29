import { useEffect, useState } from 'react';
import {
  listSubjects,
  requestSourceSubject,
  selectSubject,
  type RequestSubjectInputYearLevel,
  type SubjectSummary,
} from '@workspace/api-client-react';
import { Button } from '@workspace/geslaagd-momentum/components/ui/button';
import { Badge } from '@workspace/geslaagd-momentum/components/ui/badge';
import { Input } from '@workspace/geslaagd-momentum/components/ui/input';
import { Label } from '@workspace/geslaagd-momentum/components/ui/label';
import { Textarea } from '@workspace/geslaagd-momentum/components/ui/textarea';
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
import { BookOpen, Loader2, Plus, Send } from 'lucide-react';
import { useLocation } from 'wouter';
import { useAuth } from '@/auth/auth-context';
import { StudyPageShell, StudyPageMessage } from '@/components/study/study-page-shell';
import { Breadcrumbs } from '@workspace/geslaagd-momentum/components/layout/breadcrumbs';
import { PageHeader } from '@workspace/geslaagd-momentum/components/layout/page-header';
import { PageSections } from '@workspace/geslaagd-momentum/components/layout/section';
import { EmptyState } from '@workspace/geslaagd-momentum/components/layout/empty-state';
import { CardGridSkeleton } from '@workspace/geslaagd-momentum/components/layout/page-skeleton';

const emptyRequestForm = {
  name: '',
  description: '',
  emphasis: '',
  yearLevel: 'havo_vwo_bovenbouw' as RequestSubjectInputYearLevel,
  preferredSourceTypes: '',
};

export default function SubjectCatalogPage() {
  const [, setLocation] = useLocation();
  const { user, isLoading } = useAuth();
  const [subjects, setSubjects] = useState<SubjectSummary[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'unauthorized' | 'error'>('loading');
  const [adding, setAdding] = useState<string | null>(null);

  const [requestOpen, setRequestOpen] = useState(false);
  const [requestForm, setRequestForm] = useState(emptyRequestForm);
  const [submitting, setSubmitting] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [requestSent, setRequestSent] = useState(false);

  const load = async () => {
    setState('loading');
    try {
      setSubjects(await listSubjects());
      setState('ready');
    } catch (error) {
      setState((error as { status?: number }).status === 401 ? 'unauthorized' : 'error');
    }
  };

  useEffect(() => {
    if (!isLoading && user) void load();
    else if (!isLoading) setState('unauthorized');
  }, [isLoading, user?.id]);

  const addSubject = async (subject: SubjectSummary) => {
    setAdding(subject.id);
    try {
      await selectSubject(subject.id);
      setLocation(`/vakken/${subject.id}`);
    } catch {
      setAdding(null);
    }
  };

  const openRequestDialog = () => {
    setRequestForm(emptyRequestForm);
    setRequestError(null);
    setRequestSent(false);
    setRequestOpen(true);
  };

  const submitRequest = async () => {
    const name = requestForm.name.trim();
    if (!name) return;
    setSubmitting(true);
    setRequestError(null);
    try {
      await requestSourceSubject({
        name,
        year_level: requestForm.yearLevel,
        description: requestForm.description.trim() || undefined,
        emphasis: requestForm.emphasis.trim() || undefined,
        preferred_source_types: requestForm.preferredSourceTypes.trim() || undefined,
      });
      setRequestSent(true);
    } catch (error) {
      const data = (error as { data?: { error?: string } }).data;
      setRequestError(data?.error ?? 'Je aanvraag kon niet worden verstuurd. Probeer het later opnieuw.');
    } finally {
      setSubmitting(false);
    }
  };

  if (state === 'unauthorized') {
    return (
      <StudyPageShell>
        <StudyPageMessage
          title="Log eerst in"
          body="Meld je aan om de vakkencatalogus te bekijken."
          action={<Button onClick={() => setLocation('/auth')}>Inloggen</Button>}
        />
      </StudyPageShell>
    );
  }

  return (
    <StudyPageShell>
      <PageSections>
        <PageHeader
          breadcrumbs={
            <Breadcrumbs
              onNavigate={setLocation}
              items={[
                { label: 'Mijn leeromgeving', href: '/mijn-leeromgeving' },
                { label: 'Vakken' },
              ]}
            />
          }
          kicker={
            <>
              <BookOpen size={13} aria-hidden="true" /> vakkencatalogus
            </>
          }
          title="Kies een vak om mee te beginnen."
          description="Elk vak is opgedeeld in hoofdstukken met uitleg, oefenvragen en tentamens."
          actions={
            <Button variant="outline" onClick={openRequestDialog} data-testid="button-request-subject">
              <Send size={15} /> Vak aanvragen
            </Button>
          }
        />

      {state === 'loading' && <CardGridSkeleton cards={6} />}

      {state === 'error' && (
        <EmptyState
          title="De vakken konden niet worden geladen"
          description="Er ging iets mis bij het ophalen. Probeer het opnieuw."
          action={<Button onClick={() => void load()}>Opnieuw proberen</Button>}
        />
      )}

      {state === 'ready' && subjects.length === 0 && (
        <EmptyState
          icon={<BookOpen size={20} aria-hidden="true" />}
          title="Nog geen vakken beschikbaar"
          description="Er zijn nog geen vakken gepubliceerd. Vraag een vak aan — dan gaan we ermee aan de slag."
          action={
            <Button onClick={openRequestDialog}>
              <Send size={15} /> Vak aanvragen
            </Button>
          }
        />
      )}

      {state === 'ready' && subjects.length > 0 && (
        <ul className="subject-grid" data-testid="subject-grid">
          {subjects.map((subject) => (
            <li key={subject.id} className="subject-card">
              <div className="subject-card-head">
                <h2>{subject.name}</h2>
                <Badge variant="secondary">
                  {subject.yearLevel === 'havo_vwo_bovenbouw' ? 'HAVO/VWO Bovenbouw' : 'Universitair'}
                </Badge>
              </div>
              {subject.difficultyLevel && (
                <span className="subject-level">{subject.difficultyLevel}</span>
              )}
              <p className="subject-description">
                {subject.description ?? 'Beschrijving volgt binnenkort.'}
              </p>
              <div className="subject-card-foot">
                <span>
                  {subject.chapterCount ?? 0}{' '}
                  {subject.chapterCount === 1 ? 'hoofdstuk' : 'hoofdstukken'}
                </span>
                <div className="subject-card-actions">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setLocation(`/vakken/${subject.id}`)}
                  >
                    Bekijken
                  </Button>
                  <Button
                    size="sm"
                    disabled={adding === subject.id}
                    onClick={() => void addSubject(subject)}
                  >
                    <Plus size={15} /> Toevoegen
                  </Button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
      </PageSections>

      <Dialog open={requestOpen} onOpenChange={setRequestOpen}>
        <DialogContent data-testid="dialog-request-subject">
          <DialogHeader>
            <DialogTitle>Vak aanvragen</DialogTitle>
            <DialogDescription>
              Zie je het vak dat je nodig hebt nog niet? Vraag het aan, hoe meer detail je geeft, hoe beter we het vak kunnen samenstellen.
            </DialogDescription>
          </DialogHeader>

          {requestSent ? (
            <div className="study-page-message">
              <h2>Aanvraag verstuurd</h2>
              <p>We laten je weten zodra het vak klaarstaat.</p>
            </div>
          ) : (
            <div className="request-subject-form">
              <div>
                <Label htmlFor="request-subject-name">Vak</Label>
                <Input
                  id="request-subject-name"
                  value={requestForm.name}
                  maxLength={160}
                  onChange={(e) => setRequestForm((form) => ({ ...form, name: e.target.value }))}
                  placeholder="Bijv. Psychofarmacologie"
                />
              </div>
              <div>
                <Label htmlFor="request-subject-description">Beschrijving</Label>
                <Textarea
                  id="request-subject-description"
                  value={requestForm.description}
                  maxLength={1000}
                  onChange={(e) => setRequestForm((form) => ({ ...form, description: e.target.value }))}
                  placeholder="Korte beschrijving van het vak"
                />
              </div>
              <div>
                <Label htmlFor="request-subject-emphasis">Nadruk</Label>
                <Input
                  id="request-subject-emphasis"
                  value={requestForm.emphasis}
                  maxLength={300}
                  onChange={(e) => setRequestForm((form) => ({ ...form, emphasis: e.target.value }))}
                  placeholder="Bijv. werkingsmechanisme (mechanism of action)"
                />
              </div>
              <div>
                <Label htmlFor="request-subject-level">Niveau</Label>
                <Select
                  value={requestForm.yearLevel}
                  onValueChange={(value) =>
                    setRequestForm((form) => ({ ...form, yearLevel: value as RequestSubjectInputYearLevel }))
                  }
                >
                  <SelectTrigger id="request-subject-level" aria-label="Niveau"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="havo_vwo_bovenbouw">HAVO/VWO Bovenbouw</SelectItem>
                    <SelectItem value="universitair">Universitair</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="request-subject-sources">Type bronnen gewenst</Label>
                <Input
                  id="request-subject-sources"
                  value={requestForm.preferredSourceTypes}
                  maxLength={300}
                  onChange={(e) =>
                    setRequestForm((form) => ({ ...form, preferredSourceTypes: e.target.value }))
                  }
                  placeholder="Bijv. recente onderzoeken, richtlijnen, of boeken"
                />
              </div>
              {requestError && <p className="admin-notice is-error">{requestError}</p>}
            </div>
          )}

          <DialogFooter>
            {requestSent ? (
              <Button onClick={() => setRequestOpen(false)}>Sluiten</Button>
            ) : (
              <>
                <Button variant="ghost" onClick={() => setRequestOpen(false)} disabled={submitting}>
                  Annuleren
                </Button>
                <Button
                  onClick={() => void submitRequest()}
                  disabled={!requestForm.name.trim() || submitting}
                >
                  {submitting ? <Loader2 className="spin" size={14} /> : <Send size={14} />} Aanvragen
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </StudyPageShell>
  );
}
