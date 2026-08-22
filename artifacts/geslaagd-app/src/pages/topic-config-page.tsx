import { ArrowLeft, CheckCircle2, Save, Sparkles } from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  confirmStudyProposal,
  createStudySpace,
  getStudySpace,
  getStudySubjectDetail,
  listSelectedStudySubjects,
  updateStudySpace,
  type SelectedStudySubject,
  type StudySpaceLevel,
} from '@workspace/api-client-react';
import { useLocation } from 'wouter';
import { useAuth } from '@/auth/auth-context';
import { TagListInput } from '@/components/study/tag-list-input';
import { takePendingProposal, type PendingProposal } from '@/lib/pending-proposal';
import { Button } from '@workspace/geslaagd-momentum/components/ui/button';
import { Input } from '@workspace/geslaagd-momentum/components/ui/input';
import { RadioGroup, RadioGroupItem } from '@workspace/geslaagd-momentum/components/ui/radio-group';
import { Textarea } from '@workspace/geslaagd-momentum/components/ui/textarea';

const LEVEL_OPTIONS: { value: Exclude<StudySpaceLevel, null>; label: string; hint: string }[] = [
  { value: 'basis', label: 'Basis', hint: 'Kennismaken met de kern' },
  { value: 'gemiddeld', label: 'Gemiddeld', hint: 'Op het niveau van je toets' },
  { value: 'verdieping', label: 'Verdieping', hint: 'Extra uitdaging' },
];

type Mode = 'create-from-selection' | 'create-from-proposal' | 'edit';

type FormState = {
  title: string;
  level: StudySpaceLevel | null;
  subtopics: string[];
  sources: string[];
  subjectDescription: string;
  exampleTopics: string[];
  selectedSubjectId: string | null;
};

const emptyForm: FormState = {
  title: '',
  level: null,
  subtopics: [],
  sources: [],
  subjectDescription: '',
  exampleTopics: [],
  selectedSubjectId: null,
};

export default function TopicConfigPage({ selectionId, spaceId, fromProposal }: { selectionId?: string; spaceId?: string; fromProposal?: boolean }) {
  const [, setLocation] = useLocation();
  const { user, isLoading } = useAuth();
  const mode: Mode = spaceId ? 'edit' : fromProposal ? 'create-from-proposal' : 'create-from-selection';

  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [form, setForm] = useState<FormState>(emptyForm);
  const [subjectName, setSubjectName] = useState('');
  const [pendingProposal, setPendingProposalState] = useState<PendingProposal | null>(null);
  const [ownSubjects, setOwnSubjects] = useState<SelectedStudySubject[]>([]);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!isLoading && !user) setLocation('/auth');
  }, [isLoading, user?.id]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    setReady(false);
    setLoadError('');

    const run = async () => {
      try {
        if (mode === 'edit' && spaceId) {
          const [space, selections] = await Promise.all([getStudySpace(spaceId), listSelectedStudySubjects()]);
          if (cancelled) return;
          setOwnSubjects(selections);
          const linked = selections.find((selection) => selection.id === space.selectedSubjectId);
          setSubjectName(linked?.name ?? '');
          setForm({
            title: space.title,
            level: space.level,
            subtopics: space.subtopics,
            sources: space.sources,
            subjectDescription: space.subjectDescription,
            exampleTopics: space.exampleTopics,
            selectedSubjectId: space.selectedSubjectId,
          });
        } else if (mode === 'create-from-selection' && selectionId) {
          const detail = await getStudySubjectDetail(selectionId);
          if (cancelled) return;
          setSubjectName(detail.selection.name);
          setForm({
            ...emptyForm,
            title: '',
            subjectDescription: detail.subject?.description ?? '',
            selectedSubjectId: detail.selection.id,
          });
        } else {
          const proposal = takePendingProposal();
          if (!proposal) {
            if (!cancelled) setLoadError('Dit voorstel is niet meer beschikbaar. Vraag je studiecoach opnieuw.');
            return;
          }
          const selections = await listSelectedStudySubjects();
          if (cancelled) return;
          setOwnSubjects(selections);
          setPendingProposalState(proposal);
          const matched = proposal.subjectId ? selections.find((selection) => selection.subjectId === proposal.subjectId) : undefined;
          setSubjectName(proposal.proposedSubject);
          setForm({
            ...emptyForm,
            title: proposal.proposedTopic,
            subjectDescription: proposal.rationale,
            exampleTopics: proposal.searchTerms.slice(0, 6),
            selectedSubjectId: matched?.id ?? null,
          });
        }
      } catch {
        if (!cancelled) setLoadError('Deze pagina kon niet worden geladen.');
      } finally {
        if (!cancelled) setReady(true);
      }
    };
    void run();
    return () => { cancelled = true; };
  }, [user?.id, mode, selectionId, spaceId]);

  if (isLoading || !user) {
    return <main className="auth-page auth-loading-page"><p>Onderwerp wordt geladen…</p></main>;
  }

  const backTarget = form.selectedSubjectId ? `/mijn-leeromgeving/vak/${form.selectedSubjectId}` : '/mijn-leeromgeving';
  const header = (
    <header className="dashboard-header">
      <button className="auth-brand" onClick={() => setLocation('/mijn-leeromgeving')} aria-label="Terug naar geslaagd.app">
        <span className="wordmark-mark" /><span>geslaagd.app</span>
      </button>
    </header>
  );

  if (!ready) {
    return <main className="study-page dark">{header}<section className="study-shell"><p role="status">Onderwerp wordt geladen…</p></section></main>;
  }

  if (loadError) {
    return <main className="study-page dark">{header}<section className="study-detail" role="alert">
      <span className="study-kicker"><Sparkles size={15} /> onderwerp</span>
      <h1>Dit onderwerp kon niet worden geopend.</h1>
      <p>{loadError}</p>
      <Button className="button-large" onClick={() => setLocation('/mijn-leeromgeving')}>Naar mijn leeromgeving <ArrowLeft size={15} /></Button>
    </section></main>;
  }

  const save = async (status: 'draft' | 'active') => {
    const title = form.title.trim();
    if (title.length < 1) {
      setMessage('Geef je onderwerp een titel.');
      return;
    }
    setBusy(true);
    setMessage('');
    try {
      const payload = {
        title,
        level: form.level,
        subtopics: form.subtopics,
        sources: form.sources,
        subjectDescription: form.subjectDescription.trim(),
        exampleTopics: form.exampleTopics,
        selectedSubjectId: form.selectedSubjectId,
        status,
      };

      if (mode === 'edit' && spaceId) {
        const space = await updateStudySpace(spaceId, payload);
        setLocation(status === 'draft' ? backTarget : `/mijn-leeromgeving/${space.id}`);
        return;
      }

      if (mode === 'create-from-proposal' && pendingProposal) {
        const space = await confirmStudyProposal(pendingProposal.proposalId, {
          ...payload,
          subjectId: pendingProposal.subjectId,
          proposedSubject: pendingProposal.proposedSubject,
          proposedTopic: pendingProposal.proposedTopic,
        });
        setLocation(status === 'draft' ? backTarget : `/mijn-leeromgeving/${space.id}`);
        return;
      }

      const space = await createStudySpace(payload);
      setLocation(status === 'draft' ? backTarget : `/mijn-leeromgeving/${space.id}`);
    } catch {
      setMessage('Dit onderwerp kon niet worden opgeslagen. Probeer het opnieuw.');
    } finally {
      setBusy(false);
    }
  };

  return <main className="study-page dark">
    {header}
    <section className="study-shell topic-config-shell">
      <Button className="back-link" variant="ghost" onClick={() => setLocation(backTarget)}><ArrowLeft size={15} /> Terug</Button>

      <span className="study-kicker"><Sparkles size={15} /> onderwerp instellen</span>
      <h1>{mode === 'edit' ? 'Pas je onderwerp aan' : 'Stel je onderwerp in'}</h1>
      <p>Beschrijf wat je wilt leren, kies je niveau en voeg bronnen toe. Je kunt dit later altijd aanpassen.</p>

      {message && <p className="study-message" role="alert">{message}</p>}

      <form className="topic-config-form" onSubmit={(event) => event.preventDefault()}>
        <label className="topic-config-field">
          <span>Vak</span>
          {mode === 'create-from-proposal' && ownSubjects.length > 0 ? (
            <select
              className="topic-config-select"
              value={form.selectedSubjectId ?? ''}
              onChange={(event) => setForm((current) => ({ ...current, selectedSubjectId: event.target.value || null }))}
            >
              <option value="">Geen van jouw vakken (voorstel: {subjectName})</option>
              {ownSubjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}
            </select>
          ) : (
            <Input value={subjectName} readOnly aria-readonly="true" />
          )}
        </label>

        <label className="topic-config-field">
          <span>Onderwerp / titel</span>
          <Input value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} maxLength={160} required />
        </label>

        <fieldset className="topic-config-field topic-level-field">
          <legend>Niveau / moeilijkheid</legend>
          <RadioGroup
            value={form.level ?? ''}
            onValueChange={(value) => setForm((current) => ({ ...current, level: (value || null) as StudySpaceLevel | null }))}
            className="topic-level-options"
          >
            {LEVEL_OPTIONS.map((option) => (
              <label key={option.value} className={`topic-level-option ${form.level === option.value ? 'selected' : ''}`}>
                <RadioGroupItem value={option.value} id={`level-${option.value}`} />
                <span><strong>{option.label}</strong><small>{option.hint}</small></span>
              </label>
            ))}
          </RadioGroup>
        </fieldset>

        <TagListInput
          label="Deelonderwerpen"
          hint="Voeg de onderdelen toe die je wilt behandelen."
          values={form.subtopics}
          onChange={(subtopics) => setForm((current) => ({ ...current, subtopics }))}
          placeholder="Bijv. celdeling"
          maxItems={8}
          maxLength={80}
        />

        <TagListInput
          label="Boeken / bronnen"
          hint="Welke methode, boek of bron wil je gebruiken?"
          values={form.sources}
          onChange={(sources) => setForm((current) => ({ ...current, sources }))}
          placeholder="Bijv. Biologie voor Jou"
          maxItems={6}
          maxLength={120}
        />

        <label className="topic-config-field">
          <span>Vakbeschrijving</span>
          <Textarea
            value={form.subjectDescription}
            onChange={(event) => setForm((current) => ({ ...current, subjectDescription: event.target.value.slice(0, 500) }))}
            maxLength={500}
            rows={3}
            placeholder="Korte context over dit vak, zodat je studiecoach je beter begrijpt."
          />
        </label>

        <TagListInput
          label="Voorbeeldonderwerpen"
          hint="Typische onderwerpen die bij dit vak passen."
          values={form.exampleTopics}
          onChange={(exampleTopics) => setForm((current) => ({ ...current, exampleTopics }))}
          placeholder="Bijv. fotosynthese"
          maxItems={6}
          maxLength={120}
        />

        <div className="topic-config-actions">
          <Button type="button" className="quiet" variant="ghost" onClick={() => void save('draft')} disabled={busy}>
            <Save size={16} /> Bewaar als concept
          </Button>
          <Button type="button" onClick={() => void save('active')} disabled={busy}>
            <CheckCircle2 size={16} /> Bevestig en start
          </Button>
        </div>
      </form>
    </section>
  </main>;
}
