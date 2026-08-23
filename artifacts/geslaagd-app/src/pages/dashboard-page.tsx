import { ArrowLeft, ArrowRight, BookOpenText, ChevronRight, GraduationCap, LogOut, Settings2, Sparkles } from 'lucide-react';
import { type FormEvent, useEffect, useRef, useState } from 'react';
import {
  confirmStudyProposal,
  createStudyProposal,
  getStudyCatalog,
  getStudyPreferences,
  listSelectedStudySubjects,
  listStudySpaces,
  rejectStudyProposal,
  type SelectedStudySubject,
  type StudyPreferences,
  type StudyProposal,
  type StudyProposalAlternative,
  type StudySpace,
  type StudySubject,
} from '@workspace/api-client-react';
import { useLocation } from 'wouter';
import { useAuth } from '@/auth/auth-context';
import { SourcesSection } from '@/components/study/sources-section';
import { SubjectsManager } from '@/components/study/subjects-manager';
import { StudyProposalCard } from '@/components/study/study-proposal-card';
import { WelcomeCard } from '@/components/study/welcome-card';
import { takePendingTopic } from '@/lib/pending-topic';
import { savePendingProposal } from '@/lib/pending-proposal';
import { Button } from '@workspace/geslaagd-momentum/components/ui/button';
import { Input } from '@workspace/geslaagd-momentum/components/ui/input';

function welcomeDismissedKey(userId: string): string {
  return `geslaagd:welcome-dismissed:${userId}`;
}

export default function DashboardPage() {
  const [, setLocation] = useLocation();
  const { isLoading, user, signOut } = useAuth();
  const [spaces, setSpaces] = useState<StudySpace[]>([]);
  const [preferences, setPreferences] = useState<StudyPreferences | null | undefined>(undefined);
  const [selectedSubjects, setSelectedSubjects] = useState<SelectedStudySubject[] | null>(null);
  const [catalogSubjects, setCatalogSubjects] = useState<StudySubject[]>([]);
  const [showWelcome, setShowWelcome] = useState(false);
  const [managerOpen, setManagerOpen] = useState(false);
  const [topicInput, setTopicInput] = useState('');
  const [proposal, setProposal] = useState<StudyProposal | null>(null);
  const [message, setMessage] = useState('');
  const [loadError, setLoadError] = useState('');
  const [busy, setBusy] = useState(false);
  const loadPromiseRef = useRef<Promise<void> | null>(null);

  const load = async () => {
    if (loadPromiseRef.current) return loadPromiseRef.current;
    const request = (async () => {
      try {
        setLoadError('');
        const [catalog, nextSpaces, nextPreferences] = await Promise.all([
          getStudyCatalog(),
          listStudySpaces(),
          getStudyPreferences(),
        ]);
        // Resolved independently so a missing migration never blocks the full dashboard.
        let nextSelectedSubjects: SelectedStudySubject[] = [];
        try {
          nextSelectedSubjects = await listSelectedStudySubjects();
        } catch {
          // Table not yet created in this environment; subjects section shows the empty+manage UI.
        }
        setCatalogSubjects(catalog.subjects);
        setSpaces(nextSpaces);
        setPreferences(nextPreferences);
        setSelectedSubjects(nextSelectedSubjects);
      } catch {
        setLoadError('Je leeromgeving kon niet volledig laden.');
      }
    })();
    loadPromiseRef.current = request;
    try {
      await request;
    } finally {
      loadPromiseRef.current = null;
    }
  };

  useEffect(() => {
    if (!isLoading && !user) setLocation('/auth');
    if (user) void load();
  }, [isLoading, user?.id]);

  useEffect(() => {
    if (!user) return;
    const pendingTopic = takePendingTopic();
    if (pendingTopic) {
      setTopicInput(pendingTopic);
    }
  }, [user?.id]);

  useEffect(() => {
    if (!user || preferences === undefined) return;
    if (preferences === null && !localStorage.getItem(welcomeDismissedKey(user.id))) {
      setShowWelcome(true);
    }
  }, [user?.id, preferences]);

  const dismissWelcome = () => {
    if (user) localStorage.setItem(welcomeDismissedKey(user.id), '1');
    setShowWelcome(false);
  };

  if (!isLoading && user && loadError) {
    return (
      <main className="auth-page auth-loading-page">
        <section className="study-empty-card" role="alert">
          <p className="eyebrow">Laden mislukt</p>
          <h1>Je leeromgeving kon niet worden opgehaald</h1>
          <p>{loadError}</p>
          <Button className="button button-primary" type="button" onClick={() => void load()}>
            Opnieuw proberen
          </Button>
        </section>
      </main>
    );
  }

  if (isLoading || !user || preferences === undefined || selectedSubjects === null) {
    return <main className="auth-page auth-loading-page"><p>Je leeromgeving wordt geladen…</p></main>;
  }

  const leave = async () => {
    await signOut();
    setLocation('/');
  };

  const requestProposal = async (input: string) => {
    setBusy(true);
    setMessage('');
    setProposal(null);
    try {
      setProposal(await createStudyProposal({ input }));
    } catch {
      setMessage('De studiecoach kan dit onderwerp nu niet plaatsen. Probeer het wat specifieker.');
    } finally {
      setBusy(false);
    }
  };

  const askCoach = async (event: FormEvent) => {
    event.preventDefault();
    const input = topicInput.trim();
    if (input.length < 3) {
      setMessage('Beschrijf je onderwerp in minimaal drie tekens.');
      return;
    }
    await requestProposal(input);
  };

  const confirmProposal = async (interpretation: StudyProposalAlternative, title: string) => {
    if (!proposal) return;
    setBusy(true);
    setMessage('');
    try {
      const space = await confirmStudyProposal(proposal.id, {
        title,
        subjectId: interpretation.subjectId,
        proposedSubject: interpretation.proposedSubject,
        proposedTopic: interpretation.proposedTopic,
      });
      setLocation(`/mijn-leeromgeving/${space.id}`);
    } catch {
      setMessage('Het voorstel kon niet worden bevestigd. Mogelijk is het al verwerkt.');
    } finally {
      setBusy(false);
    }
  };

  const configureProposal = (interpretation: StudyProposalAlternative, title: string) => {
    if (!proposal) return;
    savePendingProposal({
      proposalId: proposal.id,
      subjectId: interpretation.subjectId,
      proposedSubject: interpretation.proposedSubject,
      proposedTopic: title,
      rationale: interpretation.rationale,
      searchTerms: proposal.searchTerms,
    });
    setLocation('/mijn-leeromgeving/onderwerp/nieuw-vanuit-voorstel');
  };

  const rejectProposal = async () => {
    if (!proposal) return;
    setBusy(true);
    try {
      await rejectStudyProposal(proposal.id);
      setProposal(null);
      setMessage('Het voorstel is afgewezen. Beschrijf gerust iets anders.');
    } catch {
      setMessage('Het voorstel kon niet worden afgewezen.');
    } finally {
      setBusy(false);
    }
  };

  const retryProposal = async () => {
    if (!proposal) return;
    const input = proposal.originalInput;
    setBusy(true);
    try {
      await rejectStudyProposal(proposal.id);
    } catch {
      // A retry may continue even when the old proposal was already closed.
    }
    await requestProposal(input);
  };

  const openSubject = (subject: SelectedStudySubject) => {
    setLocation(`/mijn-leeromgeving/vak/${subject.id}`);
  };

  return <main className="study-page">
    <header className="dashboard-header">
      <button className="auth-brand" onClick={() => setLocation('/')} aria-label="Terug naar geslaagd.app">
        <span className="wordmark-mark" /><span>geslaagd.app</span>
      </button>
      <div className="dashboard-actions">
        <span>{user.email}</span>
        <button type="button" onClick={leave}><LogOut size={15} /> Uitloggen</button>
      </div>
    </header>

    <section className="study-shell">
      {showWelcome && <WelcomeCard onSaved={(next) => { setPreferences(next); dismissWelcome(); }} onDismiss={dismissWelcome} />}

      <div className="study-hero">
        <div>
          <span className="study-kicker"><Sparkles size={15} /> jouw leeromgeving</span>
          <h1>Waar wil je vandaag grip op krijgen?</h1>
          <p>Kies een vak hieronder, of leg je vraag voor aan je studiecoach.</p>
          {preferences && <span className="profile-chip"><GraduationCap size={14} /> {preferences.educationLevel === 'vwo6' ? '6 VWO' : 'Eerstejaars bachelor'}{preferences.studyProfile ? ` · ${preferences.studyProfile}` : ''}</span>}
        </div>
        <div className="study-hero-note"><strong>{spaces.length}</strong><span>{spaces.length === 1 ? 'onderwerp bewaard' : 'onderwerpen bewaard'}</span></div>
      </div>

      {message && <p className="study-message" role="status">{message}</p>}

      <section className="coach-panel">
        <div><span>STUDIECOACH</span><h2>Vertel het in je eigen woorden.</h2><p>Bijvoorbeeld: “ik moet erfelijkheid begrijpen voor mijn toets”.</p></div>
        <form onSubmit={askCoach}>
          <Input value={topicInput} onChange={(event) => setTopicInput(event.target.value)} placeholder="Waar wil je mee aan de slag?" maxLength={500} />
          <Button disabled={busy}>{busy ? 'Denkt mee…' : 'Vraag het'} <ArrowRight size={16} /></Button>
        </form>
      </section>

      {proposal && <StudyProposalCard proposal={proposal} busy={busy} onConfirm={confirmProposal} onConfigure={configureProposal} onReject={rejectProposal} onRetry={retryProposal} />}

      <section className="subjects-section">
        <div className="section-title">
          <div><span>VAKKEN</span><h2>Jouw vakken</h2></div>
          <button type="button" className="manage-subjects-button" onClick={() => setManagerOpen(true)}>
            <Settings2 size={16} /> Vakken beheren
          </button>
        </div>

        {selectedSubjects.length === 0
          ? <div className="study-empty-card">
              <p className="eyebrow"><span className="eyebrow-dot" /> aan de slag</p>
              <h1>Kies je eerste vak</h1>
              <p>Kies tot vijf vakken die je nu volgt, of vertel je studiecoach hierboven waar je mee aan de slag wilt.</p>
              <Button type="button" onClick={() => setManagerOpen(true)}><Settings2 size={16} /> Vakken kiezen</Button>
            </div>
          : <div className="subject-grid">
              {selectedSubjects.map((subject, index) => <button
                key={subject.id}
                className="subject-card"
                onClick={() => openSubject(subject)}
              >
                <span>{String(index + 1).padStart(2, '0')}</span>
                <strong>{subject.name}</strong>
                <small>{subject.subjectId ? 'Bekijk resultaten, onderwerpen en boeken' : 'Eigen vak — bekijk je onderwerpen'}</small>
                <ChevronRight size={17} />
              </button>)}
            </div>}
      </section>

      <SourcesSection />

      {spaces.length > 0 && <section className="recent-section">
        <div className="section-title"><div><span>OVERZICHT</span><h2>Verder met een onderwerp</h2></div></div>
        <div className="recent-list">{spaces.slice(0, 6).map((space) => <button key={space.id} onClick={() => setLocation(`/mijn-leeromgeving/${space.id}`)}><BookOpenText size={18} /><div><strong>{space.title}</strong><small>{space.sourceType === 'ai' ? 'Studiecoach' : 'Boek en hoofdstuk'}</small></div><ChevronRight size={17} /></button>)}</div>
      </section>}

      <button className="dashboard-back" type="button" onClick={() => setLocation('/')}><ArrowLeft size={15} /> Terug naar de homepage</button>
    </section>

    {managerOpen && <SubjectsManager
      catalogSubjects={catalogSubjects}
      selected={selectedSubjects}
      onChange={setSelectedSubjects}
      onClose={() => setManagerOpen(false)}
    />}
  </main>;
}
