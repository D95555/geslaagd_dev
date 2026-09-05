import { useEffect, useRef, useState } from 'react';
import {
  applyUpgradeKey,
  getMyBilling,
  getMyProfileStatus,
  updateMyProfile,
  uploadMyAvatar,
  type BillingSummary,
  type Profile,
} from '@workspace/api-client-react';
import { Button } from '@workspace/geslaagd-momentum/components/ui/button';
import { Input } from '@workspace/geslaagd-momentum/components/ui/input';
import { Label } from '@workspace/geslaagd-momentum/components/ui/label';
import { Textarea } from '@workspace/geslaagd-momentum/components/ui/textarea';
import { PageHeader } from '@workspace/geslaagd-momentum/components/layout/page-header';
import { PageSections, Section } from '@workspace/geslaagd-momentum/components/layout/section';
import { Loader2, Upload } from 'lucide-react';
import { useAuth } from '@/auth/auth-context';
import { supabase } from '@/lib/supabase';
import { PersonAvatar } from '@/components/chat/person-avatar';
import { StudyPageShell } from '@/components/study/study-page-shell';

const packageLabel: Record<BillingSummary['package'], string> = {
  trial: 'Trial',
  basis: 'Basis',
  plus: 'Plus',
  beheerder: 'Beheerder',
};

const USERNAME_PATTERN = /^[a-z0-9_]{3,24}$/;
const PRESET_AVATARS = [1, 2, 3, 4, 5, 6].map((n) => `/avatars/preset-${n}.svg`);

function ProfileSection({ userId }: { userId: string }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [institution, setInstitution] = useState('');
  const [studyProgram, setStudyProgram] = useState('');
  const [description, setDescription] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void getMyProfileStatus().then((result) => {
      if (!('username' in result)) return;
      setProfile(result);
      setUsername(result.username);
      setDisplayName(result.displayName);
      setInstitution(result.institution ?? '');
      setStudyProgram(result.studyProgram ?? '');
      setDescription(result.description ?? '');
      setAvatarUrl(result.avatarUrl);
    });
  }, []);

  const usernameValid = USERNAME_PATTERN.test(username);
  const canSave = usernameValid && displayName.trim().length > 0 && !saving;

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    setNotice('');
    setError('');
    try {
      const updated = await updateMyProfile({
        username,
        displayName: displayName.trim(),
        institution: institution.trim() || null,
        studyProgram: studyProgram.trim() || null,
        description: description.trim() || null,
      });
      setProfile(updated);
      setNotice('Profiel opgeslagen.');
    } catch (err) {
      setError(
        (err as { status?: number }).status === 409
          ? 'Deze gebruikersnaam is al in gebruik. Kies een andere.'
          : 'Opslaan is mislukt. Probeer het opnieuw.',
      );
    } finally {
      setSaving(false);
    }
  };

  const choosePreset = async (url: string) => {
    setError('');
    try {
      const updated = await updateMyProfile({ avatarUrl: url });
      setProfile(updated);
      setAvatarUrl(updated.avatarUrl);
      setNotice('Profielfoto bijgewerkt.');
    } catch {
      setError('Profielfoto kiezen is mislukt.');
    }
  };

  const uploadAvatar = async (file: File) => {
    setError('');
    try {
      const updated = await uploadMyAvatar({ avatar: file });
      setProfile(updated);
      setAvatarUrl(updated.avatarUrl);
      setNotice('Profielfoto geüpload.');
    } catch {
      setError('Uploaden is mislukt. Kies een afbeelding van maximaal 5 MB.');
    }
  };

  if (!profile) return <Section title="Profiel"><p className="study-hint">Profiel laden…</p></Section>;

  return (
    <Section title="Profiel">
      <div className="account-avatar-row">
        <PersonAvatar id={userId} label={displayName || username} size="lg" imageUrl={avatarUrl} />
        <div className="account-avatar-actions">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadAvatar(f); }}
          />
          <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
            <Upload size={14} /> Foto uploaden
          </Button>
          <div className="account-preset-grid">
            {PRESET_AVATARS.map((url) => (
              <button
                key={url}
                type="button"
                className="account-preset"
                onClick={() => void choosePreset(url)}
                aria-label="Kies deze standaard-avatar"
              >
                <img src={url} alt="" />
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="account-field">
        <Label htmlFor="account-username">Gebruikersnaam</Label>
        <Input id="account-username" value={username} maxLength={24} onChange={(e) => setUsername(e.target.value.toLowerCase())} />
        {username.length > 0 && !usernameValid && (
          <p className="study-hint">3-24 tekens: kleine letters, cijfers en underscores.</p>
        )}
      </div>
      <div className="account-field">
        <Label htmlFor="account-display-name">Weergavenaam</Label>
        <Input id="account-display-name" value={displayName} maxLength={60} onChange={(e) => setDisplayName(e.target.value)} />
      </div>
      <div className="account-field">
        <Label htmlFor="account-institution">Onderwijsinstelling</Label>
        <Input id="account-institution" value={institution} maxLength={120} onChange={(e) => setInstitution(e.target.value)} />
      </div>
      <div className="account-field">
        <Label htmlFor="account-study">Studie</Label>
        <Input id="account-study" value={studyProgram} maxLength={120} onChange={(e) => setStudyProgram(e.target.value)} />
      </div>
      <div className="account-field">
        <Label htmlFor="account-description">Over jou</Label>
        <Textarea id="account-description" value={description} maxLength={500} onChange={(e) => setDescription(e.target.value)} />
      </div>

      {notice && <p className="admin-notice">{notice}</p>}
      {error && <p className="admin-notice is-error">{error}</p>}
      <Button disabled={!canSave} onClick={() => void save()}>
        {saving ? <Loader2 className="spin" size={14} /> : null} Profiel opslaan
      </Button>
    </Section>
  );
}

function PasswordSection({ email }: { email: string }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const canSubmit = current.length > 0 && next.length >= 8 && next === confirm && !busy;

  const submit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    setNotice('');
    setError('');
    // Herauthenticeer met het huidige wachtwoord voordat we het nieuwe zetten,
    // zodat een openstaande sessie niet zomaar het wachtwoord kan wijzigen.
    const reauth = await supabase.auth.signInWithPassword({ email, password: current });
    if (reauth.error) {
      setError('Je huidige wachtwoord klopt niet.');
      setBusy(false);
      return;
    }
    const { error: updateError } = await supabase.auth.updateUser({ password: next });
    if (updateError) {
      setError('Wachtwoord wijzigen is mislukt. Probeer het opnieuw.');
    } else {
      setNotice('Wachtwoord gewijzigd.');
      setCurrent('');
      setNext('');
      setConfirm('');
    }
    setBusy(false);
  };

  return (
    <Section title="Wachtwoord">
      <div className="account-field">
        <Label htmlFor="account-current-pw">Huidig wachtwoord</Label>
        <Input id="account-current-pw" type="password" value={current} onChange={(e) => setCurrent(e.target.value)} />
      </div>
      <div className="account-field">
        <Label htmlFor="account-new-pw">Nieuw wachtwoord</Label>
        <Input id="account-new-pw" type="password" value={next} onChange={(e) => setNext(e.target.value)} />
        {next.length > 0 && next.length < 8 && <p className="study-hint">Minimaal 8 tekens.</p>}
      </div>
      <div className="account-field">
        <Label htmlFor="account-confirm-pw">Bevestig nieuw wachtwoord</Label>
        <Input id="account-confirm-pw" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        {confirm.length > 0 && next !== confirm && <p className="study-hint">De wachtwoorden komen niet overeen.</p>}
      </div>
      {notice && <p className="admin-notice">{notice}</p>}
      {error && <p className="admin-notice is-error">{error}</p>}
      <Button disabled={!canSubmit} onClick={() => void submit()}>
        {busy ? <Loader2 className="spin" size={14} /> : null} Wachtwoord wijzigen
      </Button>
    </Section>
  );
}

export default function AccountPage() {
  const { user } = useAuth();
  const [billing, setBilling] = useState<BillingSummary | null>(null);
  const [code, setCode] = useState('');
  const [notice, setNotice] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const load = () => void getMyBilling().then(setBilling);
  useEffect(load, []);

  const submit = async () => {
    if (!code.trim()) return;
    setSubmitting(true);
    setNotice('');
    try {
      const result = await applyUpgradeKey({ code: code.trim().toUpperCase() });
      setBilling(result);
      setCode('');
      setNotice('Pakket bijgewerkt.');
    } catch {
      setNotice('Deze code is ongeldig, al gebruikt, of geen upgrade t.o.v. je huidige pakket.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <StudyPageShell>
      <PageSections>
        <PageHeader
          title="Mijn account"
          description={
            billing
              ? `Pakket: ${packageLabel[billing.package]} · Credits: ${billing.credits ?? 'onbeperkt'}`
              : undefined
          }
        />

        {user && <ProfileSection userId={user.id} />}
        {user?.email && <PasswordSection email={user.email} />}

        <Section title="Pakket">
          <label className="account-upgrade-field">
            Upgrade-code
            <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="XXXX-XXXX-XXXX" />
          </label>
          {notice && <p className="admin-notice">{notice}</p>}
          <Button disabled={submitting || !code.trim()} onClick={() => void submit()}>Code toepassen</Button>
        </Section>
      </PageSections>
    </StudyPageShell>
  );
}
