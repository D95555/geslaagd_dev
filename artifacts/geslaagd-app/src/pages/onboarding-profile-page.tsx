import { useState, type FormEvent } from 'react';
import { createMyProfile, type ApiError } from '@workspace/api-client-react';
import { Button } from '@workspace/geslaagd-momentum/components/ui/button';
import { Input } from '@workspace/geslaagd-momentum/components/ui/input';
import { Label } from '@workspace/geslaagd-momentum/components/ui/label';
import { Textarea } from '@workspace/geslaagd-momentum/components/ui/textarea';
import { useSurfaceTheme } from '@workspace/geslaagd-momentum/hooks/use-theme';
import { useLocation } from 'wouter';
import { useAuth } from '@/auth/auth-context';

const USERNAME_PATTERN = /^[a-z0-9_]{3,24}$/;

// The design spec's profiles table treats a null avatarUrl as a fully
// supported first-class state -- a default avatar chosen client-side from a
// hash of the user's id, so it's stable without the server ever storing one.
// createMyProfile's schema (Task 3) doesn't accept an avatarUrl at all, so
// onboarding doesn't offer an upload/pick step here; it's not needed for a
// working default and avoids inventing an endpoint the plan left ambiguous.
export default function OnboardingProfilePage() {
  const [, setLocation] = useLocation();
  const { refreshProfileStatus } = useAuth();
  useSurfaceTheme('light');

  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [institution, setInstitution] = useState('');
  const [studyProgram, setStudyProgram] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const usernameValid = USERNAME_PATTERN.test(username);
  const canSubmit = usernameValid && displayName.trim().length > 0 && !submitting;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      await createMyProfile({
        username,
        displayName: displayName.trim(),
        institution: institution.trim() || undefined,
        studyProgram: studyProgram.trim() || undefined,
        description: description.trim() || undefined,
      });
      await refreshProfileStatus();
      setLocation('/mijn-leeromgeving');
    } catch (err) {
      const status = (err as ApiError).status;
      setError(
        status === 409
          ? 'Deze gebruikersnaam is al in gebruik. Kies een andere.'
          : 'Je profiel kon niet worden aangemaakt. Probeer het opnieuw.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="auth-page">
      <div className="auth-grid" aria-hidden="true" />
      <div className="auth-brand" aria-label="geslaagd.app">
        <span className="wordmark-mark" aria-hidden="true" />
        <span>geslaagd.app</span>
      </div>
      <section className="auth-card onboarding-profile" aria-live="polite">
        <h1>Maak je profiel</h1>
        <p>
          Voordat je verder kunt, maken we een kort profiel aan zodat andere studenten je kunnen vinden en een
          bericht kunnen sturen.
        </p>
        <form onSubmit={(event) => void submit(event)}>
          <div>
            <Label htmlFor="onboarding-username">Gebruikersnaam</Label>
            <Input
              id="onboarding-username"
              value={username}
              onChange={(e) => setUsername(e.target.value.toLowerCase())}
              placeholder="jouwnaam"
              maxLength={24}
              required
            />
            {username.length > 0 && !usernameValid && (
              <p className="study-hint">3-24 tekens: kleine letters, cijfers en underscores.</p>
            )}
          </div>
          <div>
            <Label htmlFor="onboarding-display-name">Weergavenaam</Label>
            <Input
              id="onboarding-display-name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Je volledige naam"
              maxLength={60}
              required
            />
          </div>
          <div>
            <Label htmlFor="onboarding-institution">Onderwijsinstelling</Label>
            <Input
              id="onboarding-institution"
              value={institution}
              onChange={(e) => setInstitution(e.target.value)}
              placeholder="Bijv. je school of universiteit"
              maxLength={120}
            />
          </div>
          <div>
            <Label htmlFor="onboarding-study-program">Studie</Label>
            <Input
              id="onboarding-study-program"
              value={studyProgram}
              onChange={(e) => setStudyProgram(e.target.value)}
              placeholder="Bijv. 6 VWO of Farmacie"
              maxLength={120}
            />
          </div>
          <div>
            <Label htmlFor="onboarding-description">Over jou (optioneel)</Label>
            <Textarea
              id="onboarding-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={500}
            />
          </div>
          {error && <p className="admin-notice is-error">{error}</p>}
          <Button type="submit" disabled={!canSubmit}>
            {submitting ? 'Bezig…' : 'Profiel aanmaken'}
          </Button>
        </form>
      </section>
    </main>
  );
}
