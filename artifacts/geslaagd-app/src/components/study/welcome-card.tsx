import { ArrowRight, GraduationCap, X } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { upsertStudyPreferences, type StudyPreferences } from '@workspace/api-client-react';
import { Button } from '@workspace/geslaagd-momentum/components/ui/button';
import { Input } from '@workspace/geslaagd-momentum/components/ui/input';

const defaultLearningGoal = 'Moeilijke onderwerpen begrijpen';

export function WelcomeCard({
  onSaved,
  onDismiss,
}: {
  onSaved: (preferences: StudyPreferences) => void;
  onDismiss: () => void;
}) {
  const [educationLevel, setEducationLevel] = useState<'vwo6' | 'bachelor1'>('vwo6');
  const [studyProfile, setStudyProfile] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const preferences = await upsertStudyPreferences({
        educationLevel,
        studyProfile: studyProfile.trim(),
        learningGoals: [defaultLearningGoal],
      });
      onSaved(preferences);
    } catch {
      setError('Je leerprofiel kon niet worden opgeslagen. Probeer het opnieuw.');
    } finally {
      setBusy(false);
    }
  };

  return <section className="welcome-card" role="region" aria-labelledby="welcome-title">
    <button type="button" className="welcome-dismiss" onClick={onDismiss} aria-label="Welkomstkaart sluiten">
      <X size={16} />
    </button>
    <span className="study-kicker"><GraduationCap size={15} /> welkom</span>
    <h2 id="welcome-title">Fijn dat je er bent.</h2>
    <p>Twee korte keuzes, zodat je vakken straks beter bij je passen. Dit mag ook later.</p>

    <form onSubmit={submit}>
      <div className="welcome-options" role="radiogroup" aria-label="Waar sta je nu?">
        <label className={educationLevel === 'vwo6' ? 'selected' : ''}>
          <input type="radio" name="welcome-level" value="vwo6" checked={educationLevel === 'vwo6'} onChange={() => setEducationLevel('vwo6')} />
          6 VWO
        </label>
        <label className={educationLevel === 'bachelor1' ? 'selected' : ''}>
          <input type="radio" name="welcome-level" value="bachelor1" checked={educationLevel === 'bachelor1'} onChange={() => setEducationLevel('bachelor1')} />
          Eerstejaars bachelor
        </label>
      </div>
      <Input
        value={studyProfile}
        onChange={(event) => setStudyProfile(event.target.value)}
        maxLength={100}
        placeholder={educationLevel === 'vwo6' ? 'Profiel of vakkenpakket (optioneel)' : 'Opleiding (optioneel)'}
      />
      {error && <p className="onboarding-error">{error}</p>}
      <div className="welcome-actions">
        <Button type="submit" disabled={busy}>{busy ? 'Opslaan…' : 'Opslaan'} <ArrowRight size={15} /></Button>
        <button type="button" className="welcome-later" onClick={onDismiss}>Later</button>
      </div>
    </form>
  </section>;
}
