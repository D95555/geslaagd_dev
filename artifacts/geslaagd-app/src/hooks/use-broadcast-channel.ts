import { useEffect } from 'react';
import { useAuth } from '@/auth/auth-context';
import { supabase } from '@/lib/supabase';

/**
 * Subscribes to one broadcast event on a private topic for as long as `topic`
 * is non-null, matching the pattern already established in
 * use-conversation-channel.ts. Used by surfaces that just need "something
 * happened, go refetch" rather than the fuller conversation-channel API
 * (typing indicators, in-memory message state).
 */
export function useBroadcastChannel(topic: string | null, event: string, onEvent: () => void): void {
  const { session } = useAuth();

  useEffect(() => {
    if (!topic || !session) return;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let disposed = false;
    void (async () => {
      await supabase.realtime.setAuth(session.access_token);
      if (disposed) return;
      channel = supabase
        .channel(topic, { config: { private: true } })
        .on('broadcast', { event }, onEvent)
        .subscribe();
    })();
    return () => {
      disposed = true;
      if (channel) void supabase.removeChannel(channel);
    };
  }, [topic, event, session]);
}
