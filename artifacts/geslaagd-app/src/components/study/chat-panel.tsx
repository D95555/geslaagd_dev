import { useEffect, useState, type FormEvent } from 'react';
import {
  listChatMessages,
  sendChatMessage,
  type ChatMessage,
  type Message,
} from '@workspace/api-client-react';
import { Button } from '@workspace/geslaagd-momentum/components/ui/button';
import { Input } from '@workspace/geslaagd-momentum/components/ui/input';
import { MessageCircle, Send, X } from 'lucide-react';
import { CitedText } from './citation-tag';
import { MessageList } from '@/components/chat/message-list';

const SIMPLER_PROMPT = 'Kun je dat simpeler uitleggen?';

/** Maps the study chat's own ChatMessage shape onto the shared social
 * Message shape at the render boundary, rather than changing either
 * backend type: 'me' as senderId is fine since MessageList only ever
 * compares it against the `currentUserId` prop passed alongside it. */
function asSocialMessage(message: ChatMessage): Message {
  return {
    id: message.id,
    conversationId: '',
    senderId: message.role === 'student' ? 'me' : null,
    kind: message.role === 'assistant' ? 'ai' : 'user',
    body: message.content,
    photoUrl: null,
    references: [],
    createdAt: message.createdAt,
    deletedAt: null,
  };
}

export function ChatPanel({
  subjectId,
  chapterId,
  open,
  onClose,
}: {
  subjectId: string;
  chapterId?: string | null;
  open: boolean;
  onClose: () => void;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    if (!open) return;
    void (async () => {
      try {
        setMessages(await listChatMessages(subjectId, {}));
      } catch {
        setNotice('Het gesprek kon niet worden geladen.');
      }
    })();
  }, [open, subjectId]);

  const send = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    setSending(true);
    setNotice('');
    // Show the student's own message immediately; the server stores both sides.
    const optimistic: ChatMessage = {
      id: `pending-${Date.now()}`,
      role: 'student',
      content: trimmed,
      citations: null,
      createdAt: new Date().toISOString(),
    };
    setMessages((current) => [...current, optimistic]);
    setDraft('');

    try {
      const reply = await sendChatMessage(subjectId, {
        message: trimmed,
        ...(chapterId ? { chapterId } : {}),
      });
      setMessages((current) => [...current, reply]);
    } catch (error) {
      setMessages((current) => current.filter((message) => message.id !== optimistic.id));
      setDraft(trimmed);
      setNotice(
        (error as { status?: number }).status === 429
          ? 'Je hebt veel vragen gesteld. Probeer het over een kwartier opnieuw.'
          : 'Je bericht kon niet worden verstuurd.',
      );
    } finally {
      setSending(false);
    }
  };

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void send(draft);
  };

  if (!open) return null;

  return (
    <aside className="chat-panel" role="dialog" aria-label="Studieassistent" data-testid="chat-panel">
      <header className="chat-panel-head">
        <span>
          <MessageCircle size={16} aria-hidden="true" /> Studieassistent
        </span>
        <button type="button" onClick={onClose} aria-label="Sluiten">
          <X size={16} />
        </button>
      </header>

      <div className="chat-panel-messages">
        {messages.length === 0 && !sending ? (
          <p className="chat-panel-empty">
            Stel gerust een vraag over dit vak. Ik leg het stap voor stap uit.
          </p>
        ) : (
          <MessageList
            messages={messages.map(asSocialMessage)}
            currentUserId="me"
            senderLabel={(senderId) => (senderId ? 'Jij' : 'Studieassistent')}
            typingLabel={sending ? 'Aan het nadenken…' : null}
            renderBody={(m) => {
              const original = messages.find((msg) => msg.id === m.id)!;
              return original.role === 'assistant' ? (
                <CitedText content={original.content} citations={original.citations ?? []} />
              ) : (
                <p>{original.content}</p>
              );
            }}
          />
        )}
      </div>

      {notice && <p className="chat-panel-notice">{notice}</p>}

      <div className="chat-panel-quick">
        <Button
          variant="outline"
          size="sm"
          disabled={sending}
          onClick={() => void send(SIMPLER_PROMPT)}
        >
          Simpeler uitleggen
        </Button>
      </div>

      <form className="chat-panel-form" onSubmit={onSubmit}>
        <Input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Stel je vraag"
          disabled={sending}
          aria-label="Je vraag"
          data-testid="input-chat"
        />
        <Button type="submit" disabled={sending || !draft.trim()} aria-label="Versturen">
          <Send size={15} />
        </Button>
      </form>
    </aside>
  );
}
