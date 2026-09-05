import { useEffect, useRef, useState } from 'react';
import { listConversationMessages, type Message } from '@workspace/api-client-react';
import { useAuth } from '@/auth/auth-context';
import { supabase } from '@/lib/supabase';

export function useConversationChannel(conversationId: string) {
  const { session } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [typingUserIds, setTypingUserIds] = useState<string[]>([]);
  const typingTimeouts = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const reload = () => void listConversationMessages(conversationId).then((r) => setMessages(r.messages));
  useEffect(reload, [conversationId]);

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

  return { messages, sendTyping, typingUserIds };
}
