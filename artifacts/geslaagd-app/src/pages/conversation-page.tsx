import { useEffect, useState } from 'react';
import {
  addConversationMember,
  getConversationRoute,
  listConversationMembers,
  listDirectory,
  markConversationRead,
  removeConversationMember,
  setConversationMuted,
  transferOwnershipRoute,
  updateGroupRoute,
  type Conversation,
  type ConversationMember,
  type Profile,
} from '@workspace/api-client-react';
import { Button } from '@workspace/geslaagd-momentum/components/ui/button';
import { Input } from '@workspace/geslaagd-momentum/components/ui/input';
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
import { PageSkeleton } from '@workspace/geslaagd-momentum/components/layout/page-skeleton';
import { BellOff, Settings, UserMinus, UserPlus, Users2 } from 'lucide-react';
import { useLocation } from 'wouter';
import { useAuth } from '@/auth/auth-context';
import { StudyPageShell, StudyPageMessage } from '@/components/study/study-page-shell';
import { MessageList } from '@/components/chat/message-list';
import { MessageComposer } from '@/components/chat/message-composer';
import { PersonAvatar } from '@/components/chat/person-avatar';
import { FloatingReactions } from '@/components/chat/floating-reactions';
import { useConversationChannel } from '@/hooks/use-conversation-channel';

export default function ConversationPage({ conversationId }: { conversationId: string }) {
  const [, setLocation] = useLocation();
  const { user, isLoading } = useAuth();
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [members, setMembers] = useState<ConversationMember[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'unauthorized' | 'error'>('loading');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [memberQuery, setMemberQuery] = useState('');
  const [candidates, setCandidates] = useState<Profile[]>([]);

  const { messages, sendTyping, typingUserIds, reactions, dismissReaction } = useConversationChannel(conversationId);

  const load = async (options: { silent?: boolean } = {}) => {
    if (!options.silent) setState('loading');
    try {
      const [conv, memberList] = await Promise.all([
        getConversationRoute(conversationId),
        listConversationMembers(conversationId),
      ]);
      setConversation(conv);
      setMembers(memberList.members);
      void markConversationRead(conversationId);
      setState('ready');
    } catch (error) {
      const status = (error as { status?: number }).status;
      setState(status === 401 ? 'unauthorized' : status === 403 ? 'error' : 'error');
    }
  };

  useEffect(() => {
    if (!isLoading && user) void load();
    else if (!isLoading) setState('unauthorized');
  }, [isLoading, user?.id, conversationId]);

  useEffect(() => {
    if (!settingsOpen || !memberQuery.trim()) { setCandidates([]); return; }
    const timer = setTimeout(() => {
      void listDirectory({ query: memberQuery.trim() }).then((r) => setCandidates(r.profiles));
    }, 350);
    return () => clearTimeout(timer);
  }, [settingsOpen, memberQuery]);

  if (state === 'unauthorized') {
    return (
      <StudyPageShell>
        <StudyPageMessage
          title="Log eerst in"
          body="Meld je aan om dit gesprek te bekijken."
          action={<Button onClick={() => setLocation('/auth')}>Inloggen</Button>}
        />
      </StudyPageShell>
    );
  }

  if (state === 'loading') {
    return (
      <StudyPageShell backTo="/gesprekken" backLabel="Terug naar gesprekken">
        <PageSkeleton label="Gesprek laden…" />
      </StudyPageShell>
    );
  }

  if (state === 'error' || !conversation) {
    return (
      <StudyPageShell backTo="/gesprekken" backLabel="Terug naar gesprekken">
        <StudyPageMessage title="Dit gesprek kon niet worden geladen" body="Je bent mogelijk geen lid (meer)." />
      </StudyPageShell>
    );
  }

  const isOwner = conversation.kind === 'group' && conversation.ownerId === user?.id;
  const otherMember = conversation.kind === 'dm' ? members.find((m) => m.userId !== user?.id) : null;
  const title = conversation.kind === 'dm' ? otherMember?.displayName ?? 'Direct bericht' : conversation.title ?? 'Groepsapp';
  const myMembership = members.find((m) => m.userId === user?.id);
  const typingNames = typingUserIds
    .filter((id) => id !== user?.id)
    .map((id) => members.find((m) => m.userId === id)?.displayName ?? 'Iemand');

  const toggleMute = async () => {
    const nextMuted = !myMembership?.muted;
    await setConversationMuted(conversationId, { muted: nextMuted });
    await load();
  };

  const addMember = async (candidate: Profile) => {
    await addConversationMember(conversationId, candidate.userId);
    setMemberQuery('');
    setCandidates([]);
    await load();
  };

  const removeMember = async (userId: string) => {
    await removeConversationMember(conversationId, userId);
    await load();
  };

  const transferTo = async (userId: string) => {
    await transferOwnershipRoute(conversationId, { newOwnerId: userId });
    await load();
  };

  return (
    <StudyPageShell backTo="/gesprekken" backLabel="Terug naar gesprekken">
      <PageSections>
        <div className="profile-header-row">
          <PersonAvatar
            id={conversation.kind === 'dm' ? (otherMember?.userId ?? null) : conversation.id}
            label={title}
            icon={conversation.kind === 'group' ? <Users2 size={17} /> : undefined}
          />
          <PageHeader
            className="flex-1"
            title={title}
            description={conversation.kind === 'group' ? `${members.length} leden` : undefined}
            actions={
              <>
                <Button variant="outline" onClick={() => void toggleMute()} aria-label="Dempen">
                  <BellOff size={15} /> {myMembership?.muted ? 'Gedempt' : 'Dempen'}
                </Button>
                {isOwner && (
                  <Button variant="outline" onClick={() => setSettingsOpen(true)} aria-label="Groepsinstellingen">
                    <Settings size={15} /> Instellingen
                  </Button>
                )}
              </>
            }
          />
        </div>

        <div className="conversation-body">
          <div className="conversation-messages">
            <MessageList
              messages={messages}
              currentUserId={user?.id ?? ''}
              senderLabel={(senderId) =>
                senderId === null
                  ? 'Studieassistent'
                  : (members.find((m) => m.userId === senderId)?.displayName ?? 'Onbekend lid')
              }
              typingLabel={typingNames.length > 0 ? `${typingNames.join(', ')} is aan het typen…` : null}
            />
          </div>

          <MessageComposer
            conversationId={conversationId}
            onSent={() => void load({ silent: true })}
            onTyping={sendTyping}
          />
          <FloatingReactions reactions={reactions} onDone={dismissReaction} />
        </div>
      </PageSections>

      {isOwner && (
        <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Groepsinstellingen</DialogTitle>
              <DialogDescription>Leden beheren en eigenaarschap overdragen.</DialogDescription>
            </DialogHeader>

            <div className="request-subject-form">
              <div>
                <Input
                  value={memberQuery}
                  onChange={(e) => setMemberQuery(e.target.value)}
                  placeholder="Zoek een student om toe te voegen..."
                />
                {candidates.length > 0 && (
                  <div className="reference-picker">
                    {candidates
                      .filter((c) => !members.some((m) => m.userId === c.userId))
                      .map((candidate) => (
                        <button key={candidate.userId} type="button" onClick={() => void addMember(candidate)}>
                          <UserPlus size={13} /> {candidate.displayName} (@{candidate.username})
                        </button>
                      ))}
                  </div>
                )}
              </div>

              <ul className="conversation-member-list">
                {members.map((member) => (
                  <li key={member.userId}>
                    <span>{member.displayName}</span>
                    {member.userId !== user?.id && (
                      <span className="conversation-member-actions">
                        <Button variant="ghost" size="sm" onClick={() => void transferTo(member.userId)}>
                          Maak eigenaar
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => void removeMember(member.userId)}>
                          <UserMinus size={13} /> Verwijder
                        </Button>
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>

            <DialogFooter>
              <Button onClick={() => setSettingsOpen(false)}>Sluiten</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </StudyPageShell>
  );
}
