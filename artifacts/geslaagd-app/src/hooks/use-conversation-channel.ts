import { useEffect, useRef, useState } from 'react';
import { listConversationMessages, type Message } from '@workspace/api-client-react';
import { useAuth } from '@/auth/auth-context';
import { supabase } from '@/lib/supabase';

export type FlyingReaction = { id: string; emoji: string };

/** A message body consisting solely of emoji (and whitespace) — what triggers
 * the floating fly-out animation, as opposed to a normal text message that
 * merely contains one. */
const ZERO_WIDTH_JOINER = String.fromCharCode(0x200d);
const VARIATION_SELECTOR_16 = String.fromCharCode(0xfe0f);
const EMOJI_ONLY = new RegExp(`^[\\p{Extended_Pictographic}${ZERO_WIDTH_JOINER}${VARIATION_SELECTOR_16}\\s]+$`, 'u');
function isEmojiOnly(body: string): boolean {
  return body.trim().length > 0 && EMOJI_ONLY.test(body);
}

export function useConversationChannel(conversationId: string) {
  const { session } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [typingUserIds, setTypingUserIds] = useState<string[]>([]);
  const [reactions, setReactions] = useState<FlyingReaction[]>([]);
  const typingTimeouts = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  // Null until the first load completes, so history isn't replayed as
  // freshly-arriving reactions the moment a conversation is opened.
  const knownMessageIds = useRef<Set<string> | null>(null);

  const reload = () =>
    void listConversationMessages(conversationId).then((r) => {
      const previous = knownMessageIds.current;
      if (previous) {
        for (const message of r.messages) {
          if (!previous.has(message.id) && !message.deletedAt && isEmojiOnly(message.body)) {
            setReactions((current) => [...current, { id: message.id, emoji: message.body.trim() }]);
          }
        }
      }
      knownMessageIds.current = new Set(r.messages.map((m) => m.id));
      setMessages(r.messages);
    });
  const dismissReaction = (id: string) => setReactions((current) => current.filter((r) => r.id !== id));

  // Gated on `session`: on a fresh page load (not a client-side navigation
  // from an already-authenticated app state) this effect can otherwise fire
  // before Supabase has restored the session from storage, sending an
  // unauthenticated request that 401s and is never retried.
  useEffect(() => {
    if (!session) return;
    knownMessageIds.current = null; // switching conversations is not a "new" reaction
    reload();
  }, [conversationId, session]);

  useEffect(() => {
    if (!session) return;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let disposed = false;
    void (async () => {
      await supabase.realtime.setAuth(session.access_token);
      if (disposed) return;
      channel = supabase
        .channel(`conversation:${conversationId}`, { config: { private: true } })
        .on('broadcast', { event: 'new-message' }, reload)
        .on('broadcast', { event: 'message-deleted' }, reload)
        .on('broadcast', { event: 'typing' }, ({ payload }) => {
          const userId = (payload as { userId?: string }).userId;
          if (!userId) return;
          setTypingUserIds((current) => (current.includes(userId) ? current : [...current, userId]));
          clearTimeout(typingTimeouts.current[userId]);
          typingTimeouts.current[userId] = setTimeout(() => {
            setTypingUserIds((current) => current.filter((id) => id !== userId));
          }, 3000);
        })
        .subscribe();
    })();
    return () => {
      disposed = true;
      if (channel) void supabase.removeChannel(channel);
    };
  }, [conversationId, session]);

  const sendTyping = () => {
    if (!session) return;
    void supabase.realtime.setAuth(session.access_token).then(() => {
      const channel = supabase.channel(`conversation:${conversationId}`, { config: { private: true } });
      void channel.send({ type: 'broadcast', event: 'typing', payload: { userId: session.user.id } });
    });
  };

  return { messages, refresh: reload, sendTyping, typingUserIds, reactions, dismissReaction };
}
