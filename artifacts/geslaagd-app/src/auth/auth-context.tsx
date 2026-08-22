import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import { useLocation } from "wouter";
import {
  heartbeatSession,
  logAuthEvent,
  registerSession,
  setAuthTokenGetter,
} from "@workspace/api-client-react";

import { appUrl, supabase } from "@/lib/supabase";

type AuthContextValue = {
  isLoading: boolean;
  session: Session | null;
  user: User | null;
  broadcast: { title: string; body: string } | null;
  dismissBroadcast: () => void;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function hasVerifiedEmail(user: User | null): user is User {
  return Boolean(user?.email_confirmed_at);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [broadcast, setBroadcast] = useState<{
    title: string;
    body: string;
  } | null>(null);
  const [location] = useLocation();
  const locationRef = useRef(location);
  useEffect(() => {
    locationRef.current = location;
  }, [location]);

  useEffect(() => {
    let isMounted = true;

    const syncSession = async (nextSession: Session | null) => {
      if (!nextSession) {
        if (isMounted) {
          setSession(null);
          setUser(null);
          setIsLoading(false);
        }
        return;
      }

      const { data, error } = await supabase.auth.getUser();
      const verifiedUser =
        !error && hasVerifiedEmail(data.user) ? data.user : null;

      if (!verifiedUser) {
        await supabase.auth.signOut();
      }

      if (isMounted) {
        setSession(verifiedUser ? nextSession : null);
        setUser(verifiedUser);
        setIsLoading(false);
      }
    };

    // Rely solely on onAuthStateChange: it fires once immediately with the
    // current session (event "INITIAL_SESSION") and then on every subsequent
    // change. Also calling getSession() here would trigger a second,
    // redundant syncSession() for the initial state, producing a fresh
    // user/session object shortly after mount and re-triggering any effect
    // keyed on `user` (e.g. dashboard/data loads) a second time.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      void syncSession(nextSession);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    setAuthTokenGetter(
      async () =>
        (await supabase.auth.getSession()).data.session?.access_token ?? null,
    );
    return () => setAuthTokenGetter(null);
  }, []);

  useEffect(() => {
    if (!user || !session) return;
    const storageKey = "geslaagd.client-session-id";
    let clientSessionId = sessionStorage.getItem(storageKey);
    if (!clientSessionId) {
      clientSessionId = crypto.randomUUID();
      sessionStorage.setItem(storageKey, clientSessionId);
    }
    const deviceLabel = navigator.userAgent.includes("Mobile")
      ? "Mobiele browser"
      : "Webbrowser";
    const id = clientSessionId;
    void registerSession({ clientSessionId: id, deviceLabel }).then(
      (tracked) => {
        if (tracked.revokedAt) void supabase.auth.signOut();
      },
    );
    const heartbeat = window.setInterval(() => {
      void heartbeatSession({
        clientSessionId: id,
        currentPage: locationRef.current.split("?")[0],
      }).catch(() => void supabase.auth.signOut());
    }, 60_000);
    let commandChannel: ReturnType<typeof supabase.channel> | null = null;
    let broadcastChannel: ReturnType<typeof supabase.channel> | null = null;
    let disposed = false;
    void (async () => {
      await supabase.realtime.setAuth(session.access_token);
      if (disposed) return;
      commandChannel = supabase
        .channel(`user:${user.id}:session:${id}:commands`, {
          config: { private: true },
        })
        .on("broadcast", { event: "logout" }, async () => {
          await supabase.auth.signOut();
          window.location.assign(appUrl("/auth"));
        })
        .subscribe();
      broadcastChannel = supabase
        .channel("app:broadcasts", { config: { private: true } })
        .on("broadcast", { event: "message" }, ({ payload }) => {
          const content = payload as { title?: string; body?: string };
          if (content.title && content.body)
            setBroadcast({ title: content.title, body: content.body });
        })
        .subscribe();
    })();
    return () => {
      disposed = true;
      window.clearInterval(heartbeat);
      if (commandChannel) void supabase.removeChannel(commandChannel);
      if (broadcastChannel) void supabase.removeChannel(broadcastChannel);
    };
  }, [session, user]);

  const value = useMemo<AuthContextValue>(
    () => ({
      isLoading,
      session,
      user,
      broadcast,
      dismissBroadcast: () => setBroadcast(null),
      signOut: async () => {
        if (user && session) {
          // Await this before signing out. A fire-and-forget call here races
          // against signOut()'s server-side session revocation: our API
          // verifies the token via Supabase (including an active-session
          // check), and if signOut() revokes the session first, that check
          // fails and the logout security log is silently dropped with a 401.
          // Passing the token explicitly (rather than the ambient getter)
          // avoids a second, separate race on the token itself.
          await logAuthEvent(
            {
              event: "logout",
              email: user.email,
              device: navigator.userAgent.includes("Mobile")
                ? "Mobiele browser"
                : "Webbrowser",
            },
            { headers: { authorization: `Bearer ${session.access_token}` } },
          ).catch(() => undefined);
        }
        await supabase.auth.signOut();
      },
    }),
    [broadcast, isLoading, session, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth moet binnen AuthProvider worden gebruikt.");
  }

  return context;
}
