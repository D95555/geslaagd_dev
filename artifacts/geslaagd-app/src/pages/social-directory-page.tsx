import { useEffect, useState } from 'react';
import { listDirectory, type Profile } from '@workspace/api-client-react';
import { Input } from '@workspace/geslaagd-momentum/components/ui/input';
import { PageHeader } from '@workspace/geslaagd-momentum/components/layout/page-header';
import { PageSections } from '@workspace/geslaagd-momentum/components/layout/section';
import { EmptyState } from '@workspace/geslaagd-momentum/components/layout/empty-state';
import { CardGridSkeleton } from '@workspace/geslaagd-momentum/components/layout/page-skeleton';
import { Users2 } from 'lucide-react';
import { useLocation } from 'wouter';
import { useAuth } from '@/auth/auth-context';
import { StudyPageShell, StudyPageMessage } from '@/components/study/study-page-shell';
import { Button } from '@workspace/geslaagd-momentum/components/ui/button';
import { PersonAvatar } from '@/components/chat/person-avatar';

export default function SocialDirectoryPage() {
  const [, setLocation] = useLocation();
  const { user, isLoading } = useAuth();
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'unauthorized' | 'error'>('loading');

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query.trim()), 350);
    return () => clearTimeout(timer);
  }, [query]);

  const load = async () => {
    setState('loading');
    try {
      const result = await listDirectory(debouncedQuery ? { query: debouncedQuery } : undefined);
      setProfiles(result.profiles);
      setState('ready');
    } catch (error) {
      setState((error as { status?: number }).status === 401 ? 'unauthorized' : 'error');
    }
  };

  useEffect(() => {
    if (!isLoading && user) void load();
    else if (!isLoading) setState('unauthorized');
  }, [isLoading, user?.id, debouncedQuery]);

  if (state === 'unauthorized') {
    return (
      <StudyPageShell>
        <StudyPageMessage
          title="Log eerst in"
          body="Meld je aan om de studentendirectory te bekijken."
          action={<Button onClick={() => setLocation('/auth')}>Inloggen</Button>}
        />
      </StudyPageShell>
    );
  }

  return (
    <StudyPageShell>
      <PageSections>
        <PageHeader
          kicker={
            <>
              <Users2 size={13} aria-hidden="true" /> studenten
            </>
          }
          title="Vind medestudenten."
          description="Zoek op naam, gebruikersnaam of studie."
        />

        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Zoek een student..."
          className="social-directory-search"
        />

        {state === 'loading' && <CardGridSkeleton cards={6} />}

        {state === 'error' && (
          <EmptyState
            title="De directory kon niet worden geladen"
            description="Er ging iets mis bij het ophalen. Probeer het opnieuw."
            action={<Button onClick={() => void load()}>Opnieuw proberen</Button>}
          />
        )}

        {state === 'ready' && profiles.length === 0 && (
          <EmptyState
            icon={<Users2 size={20} aria-hidden="true" />}
            title="Geen studenten gevonden"
            description="Probeer een andere zoekterm."
          />
        )}

        {state === 'ready' && profiles.length > 0 && (
          <ul className="social-directory-grid" data-testid="directory-grid">
            {profiles.map((profile) => (
              <li key={profile.userId}>
                <button
                  type="button"
                  className="social-profile-card"
                  onClick={() => setLocation(`/profielen/${profile.userId}`)}
                >
                  <div className="social-profile-card-head">
                    <PersonAvatar id={profile.userId} label={profile.displayName} />
                    <div>
                      <strong>{profile.displayName}</strong>
                      <span>@{profile.username}</span>
                    </div>
                  </div>
                  {profile.studyProgram && <small>{profile.studyProgram}</small>}
                </button>
              </li>
            ))}
          </ul>
        )}
      </PageSections>
    </StudyPageShell>
  );
}
