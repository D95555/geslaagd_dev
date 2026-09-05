import { useEffect, useState } from 'react';
import { createGroupRoute, listConversations, listDirectory, type ConversationSummary, type Profile } from '@workspace/api-client-react';
import { Button } from '@workspace/geslaagd-momentum/components/ui/button';
import { Input } from '@workspace/geslaagd-momentum/components/ui/input';
import { Label } from '@workspace/geslaagd-momentum/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@workspace/geslaagd-momentum/components/ui/dialog';
import { PageHeader } from '@workspace/geslaagd-momentum/components/layout/page-header';
import { PageSections } from '@workspace/geslaagd-momentum/components/layout/section';
import { EmptyState } from '@workspace/geslaagd-momentum/components/layout/empty-state';
import { ListSkeleton } from '@workspace/geslaagd-momentum/components/layout/page-skeleton';
import { MessageSquare, Plus, Users2 } from 'lucide-react';
import { useLocation } from 'wouter';
import { useAuth } from '@/auth/auth-context';
import { StudyPageShell, StudyPageMessage } from '@/components/study/study-page-shell';
import { PersonAvatar } from '@/components/chat/person-avatar';

function fmtRelative(value: string | null): string {
  if (!value) return '';
  const diffMs = Date.now() - new Date(value).getTime();
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return 'zojuist';
  if (minutes < 60) return `${minutes} min geleden`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} uur geleden`;
  const days = Math.floor(hours / 24);
  return `${days} dagen geleden`;
}

export default function InboxPage() {
  const [, setLocation] = useLocation();
  const { user, isLoading } = useAuth();
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'unauthorized' | 'error'>('loading');

  const [groupOpen, setGroupOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [memberQuery, setMemberQuery] = useState('');
  const [candidates, setCandidates] = useState<Profile[]>([]);
  const [selectedMembers, setSelectedMembers] = useState<Profile[]>([]);
  const [creating, setCreating] = useState(false);

  const load = async () => {
    setState('loading');
    try {
      const result = await listConversations();
      setConversations(
        [...result.conversations].sort((a, b) => {
          const aTime = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
          const bTime = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
          return bTime - aTime;
        }),
      );
      setState('ready');
    } catch (error) {
      setState((error as { status?: number }).status === 401 ? 'unauthorized' : 'error');
    }
  };

  useEffect(() => {
    if (!isLoading && user) void load();
    else if (!isLoading) setState('unauthorized');
  }, [isLoading, user?.id]);

  useEffect(() => {
    if (!groupOpen || !memberQuery.trim()) { setCandidates([]); return; }
    const timer = setTimeout(() => {
      void listDirectory({ query: memberQuery.trim() }).then((r) => setCandidates(r.profiles));
    }, 350);
    return () => clearTimeout(timer);
  }, [groupOpen, memberQuery]);

  const openGroupDialog = () => {
    setTitle('');
    setMemberQuery('');
    setCandidates([]);
    setSelectedMembers([]);
    setGroupOpen(true);
  };

  const createGroup = async () => {
    if (!title.trim() || selectedMembers.length === 0) return;
    setCreating(true);
    try {
      const conversation = await createGroupRoute({
        title: title.trim(),
        memberIds: selectedMembers.map((m) => m.userId),
      });
      setGroupOpen(false);
      setLocation(`/gesprekken/${conversation.id}`);
    } finally {
      setCreating(false);
    }
  };

  if (state === 'unauthorized') {
    return (
      <StudyPageShell>
        <StudyPageMessage
          title="Log eerst in"
          body="Meld je aan om je gesprekken te bekijken."
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
              <MessageSquare size={13} aria-hidden="true" /> gesprekken
            </>
          }
          title="Je berichten."
          description="Directe berichten en groepsapps."
          actions={
            <Button onClick={openGroupDialog}>
              <Plus size={15} /> Nieuwe groep
            </Button>
          }
        />

        {state === 'loading' && <ListSkeleton rows={5} />}

        {state === 'error' && (
          <EmptyState
            title="Gesprekken konden niet worden geladen"
            description="Er ging iets mis bij het ophalen. Probeer het opnieuw."
            action={<Button onClick={() => void load()}>Opnieuw proberen</Button>}
          />
        )}

        {state === 'ready' && conversations.length === 0 && (
          <EmptyState
            icon={<MessageSquare size={20} aria-hidden="true" />}
            title="Nog geen gesprekken"
            description="Stuur iemand een bericht vanaf hun profiel, of begin een groepsapp."
            action={
              <Button variant="outline" onClick={() => setLocation('/social')}>
                <Users2 size={15} /> Naar studenten
              </Button>
            }
          />
        )}

        {state === 'ready' && conversations.length > 0 && (
          <ul className="inbox-list" data-testid="inbox-list">
            {conversations.map((conversation) => (
              <li key={conversation.id}>
                <button
                  type="button"
                  className={`inbox-row ${conversation.unread ? 'is-unread' : ''}`}
                  onClick={() => setLocation(`/gesprekken/${conversation.id}`)}
                >
                  <PersonAvatar
                    id={conversation.id}
                    label={conversation.displayTitle ?? (conversation.kind === 'dm' ? 'Direct bericht' : 'Groepsapp')}
                    icon={conversation.kind === 'group' ? <Users2 size={16} /> : undefined}
                  />
                  <span className="inbox-row-title">
                    {conversation.unread && <span className="inbox-unread-dot" aria-hidden="true" />}
                    <strong>{conversation.displayTitle ?? (conversation.kind === 'dm' ? 'Direct bericht' : 'Groepsapp')}</strong>
                  </span>
                  <span className="inbox-row-meta">{fmtRelative(conversation.lastMessageAt)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </PageSections>

      <Dialog open={groupOpen} onOpenChange={setGroupOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nieuwe groepsapp</DialogTitle>
            <DialogDescription>Geef de groep een naam en kies wie erbij hoort.</DialogDescription>
          </DialogHeader>
          <div className="request-subject-form">
            <div>
              <Label htmlFor="group-title">Naam</Label>
              <Input id="group-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={100} />
            </div>
            <div>
              <Label htmlFor="group-members">Leden</Label>
              <Input
                id="group-members"
                value={memberQuery}
                onChange={(e) => setMemberQuery(e.target.value)}
                placeholder="Zoek een student..."
              />
              {candidates.length > 0 && (
                <div className="reference-picker">
                  {candidates
                    .filter((c) => !selectedMembers.some((m) => m.userId === c.userId))
                    .map((candidate) => (
                      <button
                        key={candidate.userId}
                        type="button"
                        onClick={() => {
                          setSelectedMembers((current) => [...current, candidate]);
                          setMemberQuery('');
                          setCandidates([]);
                        }}
                      >
                        {candidate.displayName} (@{candidate.username})
                      </button>
                    ))}
                </div>
              )}
              {selectedMembers.length > 0 && (
                <div className="composer-references">
                  {selectedMembers.map((member) => (
                    <span key={member.userId} className="composer-reference-tag">
                      {member.displayName}{' '}
                      <button
                        type="button"
                        onClick={() => setSelectedMembers((c) => c.filter((m) => m.userId !== member.userId))}
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setGroupOpen(false)} disabled={creating}>
              Annuleren
            </Button>
            <Button onClick={() => void createGroup()} disabled={!title.trim() || selectedMembers.length === 0 || creating}>
              Aanmaken
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </StudyPageShell>
  );
}
