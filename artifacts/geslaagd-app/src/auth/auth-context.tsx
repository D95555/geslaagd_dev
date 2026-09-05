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
  dismissNotification as dismissNotificationRequest,
  getMyProfileStatus,
  heartbeatSession,
  listNotifications,
  logAuthEvent,
  registerSession,
  setAuthTokenGetter,
  type Notification,
} from "@workspace/api-client-react";

import { appUrl, supabase } from "@/lib/supabase";

type AuthContextValue = {
  isLoading: boolean;
  session: Session | null;
  user: User | null;
  isAdmin: boolean;
  /** null = not yet checked. Drives the mandatory onboarding redirect. */
  needsProfile: boolean | null;
  notifications: Notification[];
  dismissNotification: (id: string) => void;
  signOut: () => Promise<void>;
  /** Re-checks profile status — call right after onboarding completes so the
   * mandatory-gate redirect in App.tsx doesn't immediately bounce back. */
  refreshProfileStatus: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function hasVerifiedEmail(user: User | null): user is User {
  return Boolean(user?.email_confirmed_at);
}

/**
 * Only decides whether admin navigation is shown. The role lives in
 * app_metadata, which users cannot set themselves, but every admin endpoint
 * still checks the role server-side — this is never the access control.
 */
function isAdminUser(user: User | null): boolean {
  return user?.app_metadata?.["role"] === "admin";
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [needsProfile, setNeedsProfile] = useState<boolean | null>(null);
  const refreshProfileStatus = async () => {
    await getMyProfileStatus()
      .then((status) => setNeedsProfile("hasProfile" in status))
      .catch(() => undefined);
  };
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
    const refreshNotifications = () =>
      void listNotifications()
        .then((result) => setNotifications(result.notifications))
        .catch(() => undefined);
    refreshNotifications();
    void refreshProfileStatus();

    let commandChannel: ReturnType<typeof supabase.channel> | null = null;
    let globalNotificationsChannel: ReturnType<typeof supabase.channel> | null = null;
    let personalNotificationsChannel: ReturnType<typeof supabase.channel> | null = null;
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
      globalNotificationsChannel = supabase
        .channel("app:notifications", { config: { private: true } })
        .on("broadcast", { event: "refresh" }, refreshNotifications)
        .subscribe();
      personalNotificationsChannel = supabase
        .channel(`user:${user.id}:notifications`, { config: { private: true } })
        .on("broadcast", { event: "refresh" }, refreshNotifications)
        .subscribe();
    })();
    return () => {
      disposed = true;
      window.clearInterval(heartbeat);
      if (commandChannel) void supabase.removeChannel(commandChannel);
      if (globalNotificationsChannel) void supabase.removeChannel(globalNotificationsChannel);
      if (personalNotificationsChannel) void supabase.removeChannel(personalNotificationsChannel);
    };
  }, [session, user]);

  const value = useMemo<AuthContextValue>(
    () => ({
      isLoading,
      session,
      user,
      isAdmin: isAdminUser(user),
      needsProfile,
      refreshProfileStatus,
      notifications,
      dismissNotification: (id: string) => {
        void dismissNotificationRequest(id).catch(() => undefined);
        setNotifications((all) => all.filter((n) => n.id !== id));
      },
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
    [notifications, needsProfile, isLoading, session, user],
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
