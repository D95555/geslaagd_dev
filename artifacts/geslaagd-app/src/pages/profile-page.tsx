import { useEffect, useState } from 'react';
import { blockUserRoute, getProfileById, startDm, type Profile } from '@workspace/api-client-react';
import { Button } from '@workspace/geslaagd-momentum/components/ui/button';
import { PageHeader } from '@workspace/geslaagd-momentum/components/layout/page-header';
import { PageSections, Section } from '@workspace/geslaagd-momentum/components/layout/section';
import { PageSkeleton } from '@workspace/geslaagd-momentum/components/layout/page-skeleton';
import { MessageCircle, UserRoundX } from 'lucide-react';
import { useLocation } from 'wouter';
import { useAuth } from '@/auth/auth-context';
import { StudyPageShell, StudyPageMessage } from '@/components/study/study-page-shell';

export default function ProfilePage({ userId }: { userId: string }) {
  const [, setLocation] = useLocation();
  const { user, isLoading } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'unauthorized' | 'error'>('loading');
  const [messaging, setMessaging] = useState(false);
  const [blockBusy, setBlockBusy] = useState(false);

  const load = async () => {
    setState('loading');
    try {
      setProfile(await getProfileById(userId));
      setState('ready');
    } catch (error) {
      setState((error as { status?: number }).status === 401 ? 'unauthorized' : 'error');
    }
  };

  useEffect(() => {
    if (!isLoading && user) void load();
    else if (!isLoading) setState('unauthorized');
  }, [isLoading, user?.id, userId]);

  const sendMessage = async () => {
    setMessaging(true);
    try {
      const conversation = await startDm(userId);
      setLocation(`/gesprekken/${conversation.id}`);
    } catch {
      setMessaging(false);
    }
  };

  // Blocking is symmetric and always blanks the profile view for both
  // directions (see the isBlocked branch below), so once blocked this page
  // is unreachable for either party — there is no "unblock" action to offer
  // here; only ever a one-way "Blokkeren".
  const block = async () => {
    if (!profile) return;
    setBlockBusy(true);
    try {
      await blockUserRoute(userId);
      await load();
    } finally {
      setBlockBusy(false);
    }
  };

  if (state === 'unauthorized') {
    return (
      <StudyPageShell>
        <StudyPageMessage
          title="Log eerst in"
          body="Meld je aan om dit profiel te bekijken."
          action={<Button onClick={() => setLocation('/auth')}>Inloggen</Button>}
        />
      </StudyPageShell>
    );
  }

  if (state === 'loading') {
    return (
      <StudyPageShell backTo="/social" backLabel="Terug naar studenten">
        <PageSkeleton label="Profiel laden…" />
      </StudyPageShell>
    );
  }

  if (state === 'error' || !profile) {
    return (
      <StudyPageShell backTo="/social" backLabel="Terug naar studenten">
        <StudyPageMessage title="Dit profiel kon niet worden geladen" body="Probeer het opnieuw." />
      </StudyPageShell>
    );
  }

  if (profile.isBlocked) {
    return (
      <StudyPageShell backTo="/social" backLabel="Terug naar studenten">
        <StudyPageMessage
          title="Je kunt dit profiel niet meer bekijken"
          body="Een van jullie beiden heeft de ander geblokkeerd."
        />
      </StudyPageShell>
    );
  }

  const isOwnProfile = user?.id === userId;

  return (
    <StudyPageShell backTo="/social" backLabel="Terug naar studenten">
      <PageSections>
        <PageHeader
          title={profile.displayName}
          description={`@${profile.username}`}
          actions={
            isOwnProfile ? undefined : (
              <>
                <Button onClick={() => void sendMessage()} disabled={messaging} data-testid="button-send-message">
                  <MessageCircle size={15} /> Stuur bericht
                </Button>
                <Button variant="outline" onClick={() => void block()} disabled={blockBusy}>
                  <UserRoundX size={15} /> Blokkeren
                </Button>
              </>
            )
          }
        />

        {(profile.institution || profile.studyProgram) && (
          <Section title="Over">
            {profile.institution && <p>{profile.institution}</p>}
            {profile.studyProgram && <p>{profile.studyProgram}</p>}
          </Section>
        )}

        {profile.description && (
          <Section title="Beschrijving">
            <p>{profile.description}</p>
          </Section>
        )}

        {profile.vakken.length > 0 && (
          <Section title="Vakken">
            <ul className="profile-vakken-list">
              {profile.vakken.map((vak) => (
                <li key={vak.subjectId}>{vak.name}</li>
              ))}
            </ul>
          </Section>
        )}
      </PageSections>
    </StudyPageShell>
  );
}
