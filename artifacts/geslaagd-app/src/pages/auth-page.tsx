import { type FormEvent, useEffect, useState } from 'react';
import {
  ArrowLeft,
  ArrowUpRight,
  Check,
  KeyRound,
  MailCheck,
  ShieldCheck,
} from 'lucide-react';
import { useLocation } from 'wouter';

import { useAuth } from '@/auth/auth-context';
import { appUrl, supabase } from '@/lib/supabase';
import { logAuthEvent, requestPasswordReset } from '@workspace/api-client-react';
import { Button } from '@workspace/geslaagd-momentum/components/ui/button';
import { Input } from '@workspace/geslaagd-momentum/components/ui/input';

type AuthMode = 'login' | 'signup' | 'forgot' | 'verify';

function readableAuthError(message: string): string {
  const normalized = message.toLowerCase();

  if (normalized.includes('email not confirmed')) {
    return 'Je e-mailadres is nog niet bevestigd. Controleer je inbox of vraag een nieuwe link aan.';
  }
  if (normalized.includes('invalid login credentials')) {
    return 'Dit e-mailadres en wachtwoord horen niet bij elkaar.';
  }
  if (normalized.includes('password should be at least')) {
    return 'Kies een wachtwoord van minimaal 6 tekens.';
  }
  if (normalized.includes('rate limit') || normalized.includes('too many requests')) {
    return 'Je hebt net veel verzoeken gedaan. Wacht even en probeer het opnieuw.';
  }
  if (normalized.includes('email rate limit exceeded')) {
    return 'Er zijn te veel e-mails aangevraagd. Probeer het later opnieuw.';
  }

  return 'Er ging iets mis. Probeer het opnieuw.';
}

export default function AuthPage() {
  const [, setLocation] = useLocation();
  const { isLoading, user } = useAuth();
  const [mode, setMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isBusy, setIsBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isLoading && user) {
      setLocation('/mijn-leeromgeving');
    }
  }, [isLoading, setLocation, user]);

  const resetFeedback = () => {
    setError('');
    setMessage('');
  };

  const switchMode = (nextMode: AuthMode) => {
    resetFeedback();
    setMode(nextMode);
  };

  const submitLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    resetFeedback();
    setIsBusy(true);

    const { data, error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });

    if (signInError) {
      setError(readableAuthError(signInError.message));
      if (signInError.message.toLowerCase().includes('confirmed')) {
        setMode('verify');
      }
    } else if (!data.user.email_confirmed_at) {
      await supabase.auth.signOut();
      setMode('verify');
      setMessage('Bevestig eerst je e-mailadres voordat je inlogt.');
    } else {
      void logAuthEvent(
        { event: 'login', email: data.user.email, device: navigator.userAgent.includes('Mobile') ? 'Mobiele browser' : 'Webbrowser' },
        { headers: { authorization: `Bearer ${data.session.access_token}` } },
      ).catch(() => undefined);
      setLocation('/mijn-leeromgeving');
    }

    setIsBusy(false);
  };

  const submitSignup = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    resetFeedback();
    setIsBusy(true);

    const normalizedEmail = email.trim().toLowerCase();
    const { data, error: signUpError } = await supabase.auth.signUp({
      email: normalizedEmail,
      password,
      options: {
        emailRedirectTo: appUrl('/auth'),
      },
    });

    if (signUpError) {
      setError(readableAuthError(signUpError.message));
    } else {
      if (data.session) {
        await supabase.auth.signOut();
      }
      setEmail(normalizedEmail);
      setPassword('');
      setMode('verify');
      if (data.user?.id) {
        void logAuthEvent({ event: 'signup', email: normalizedEmail, userId: data.user.id, device: navigator.userAgent.includes('Mobile') ? 'Mobiele browser' : 'Webbrowser' }).catch(() => undefined);
      }
      setMessage(
        'Als dit adres nog geen account heeft, ontvang je zo een e-mail om je account te bevestigen.',
      );
    }

    setIsBusy(false);
  };

  const resendVerification = async () => {
    if (!email.trim()) {
      setError('Vul eerst je e-mailadres in.');
      return;
    }

    resetFeedback();
    setIsBusy(true);
    const { error: resendError } = await supabase.auth.resend({
      type: 'signup',
      email: email.trim().toLowerCase(),
      options: {
        emailRedirectTo: appUrl('/auth'),
      },
    });

    if (resendError) {
      setError(readableAuthError(resendError.message));
    } else {
      setMessage('Als dit adres een onbevestigd account heeft, is er een nieuwe link verstuurd.');
    }
    setIsBusy(false);
  };

  const submitForgotPassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    resetFeedback();
    setIsBusy(true);

    try {
      await requestPasswordReset({
        email: email.trim().toLowerCase(),
        device: navigator.userAgent.includes('Mobile') ? 'Mobiele browser' : 'Webbrowser',
      });
      setMessage(
        'Als dit e-mailadres bij een account hoort, sturen we je een link om je wachtwoord opnieuw in te stellen.',
      );
    } catch (resetError) {
      setError(
        readableAuthError(
          resetError instanceof Error ? resetError.message : 'Wachtwoordherstel mislukt.',
        ),
      );
    }

    setIsBusy(false);
  };

  if (isLoading) {
    return <AuthLoading />;
  }

  if (mode === 'verify') {
    return (
      <AuthShell>
        <div className="auth-kicker"><MailCheck size={15} /> e-mail bevestigen</div>
        <h1>Check je inbox.</h1>
        <p>
          We sturen een verificatielink naar <strong>{email || 'je e-mailadres'}</strong>.
          Pas daarna kun je inloggen en je leeromgeving openen.
        </p>
        <Feedback error={error} message={message} />
        <Button className="auth-submit" type="button" onClick={resendVerification} disabled={isBusy}>
          {isBusy ? 'Even geduld…' : 'Stuur verificatielink opnieuw'} <ArrowUpRight size={16} />
        </Button>
        <Button className="auth-text-button" variant="ghost" type="button" onClick={() => switchMode('login')}>
          <ArrowLeft size={14} /> Terug naar inloggen
        </Button>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <div className="auth-kicker"><ShieldCheck size={15} /> veilige toegang</div>
      <h1>
        {mode === 'signup'
          ? 'Begin met overzicht.'
          : mode === 'forgot'
            ? 'Kies opnieuw.'
            : 'Welkom terug.'}
      </h1>
      <p>
        {mode === 'signup'
          ? 'Maak je account aan. Je bevestigt eerst je e-mailadres voordat je kunt inloggen.'
          : mode === 'forgot'
            ? 'Vul je e-mailadres in. We sturen je een veilige link om een nieuw wachtwoord te kiezen.'
            : 'Log in om je onderwerpen, samenvattingen en voortgang op één plek te bewaren.'}
      </p>

      <form
        className="auth-form"
        onSubmit={
          mode === 'signup'
            ? submitSignup
            : mode === 'forgot'
              ? submitForgotPassword
              : submitLogin
        }
      >
        <label htmlFor="email">E-mailadres</label>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="jij@voorbeeld.nl"
        />
        {mode !== 'forgot' && (
          <>
            <label htmlFor="password">Wachtwoord</label>
            <Input
              id="password"
              type="password"
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              required
              minLength={6}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Minimaal 6 tekens"
            />
          </>
        )}
        <Feedback error={error} message={message} />
        <Button className="auth-submit" type="submit" disabled={isBusy}>
          {isBusy
            ? 'Even geduld…'
            : mode === 'signup'
              ? 'Account aanmaken'
              : mode === 'forgot'
                ? 'Stuur herstel-link'
                : 'Inloggen'}{' '}
          <ArrowUpRight size={16} />
        </Button>
      </form>

      <div className="auth-switch">
        {mode === 'login' && (
          <>
            <button type="button" onClick={() => switchMode('forgot')}>Wachtwoord vergeten?</button>
            <span>Nog geen account? <button type="button" onClick={() => switchMode('signup')}>Aanmelden</button></span>
          </>
        )}
        {mode === 'signup' && (
          <span>Al een account? <button type="button" onClick={() => switchMode('login')}>Inloggen</button></span>
        )}
        {mode === 'forgot' && (
          <button type="button" onClick={() => switchMode('login')}><ArrowLeft size={14} /> Terug naar inloggen</button>
        )}
      </div>
    </AuthShell>
  );
}

export function PasswordRecoveryPage() {
  const [, setLocation] = useLocation();
  const [isReady, setIsReady] = useState(false);
  const [isCompleted, setIsCompleted] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    let isMounted = true;
    const hasRecoveryHash = window.location.hash.includes('type=recovery');

    const checkRecoverySession = async () => {
      const { data } = await supabase.auth.getSession();
      if (isMounted && hasRecoveryHash && data.session) {
        setIsReady(true);
      }
    };

    void checkRecoverySession();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (isMounted && event === 'PASSWORD_RECOVERY' && session) {
        setIsReady(true);
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const submitNewPassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setMessage('');

    if (password.length < 6) {
      setError('Kies een wachtwoord van minimaal 6 tekens.');
      return;
    }
    if (password !== confirmation) {
      setError('De wachtwoorden zijn niet hetzelfde.');
      return;
    }

    setIsBusy(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });

    if (updateError) {
      setError(readableAuthError(updateError.message));
    } else {
      // Await this before signing out. A fire-and-forget call here races
      // against signOut()'s server-side session revocation: our API verifies
      // the token via Supabase (including an active-session check), and if
      // signOut() revokes the session first, that check fails and this
      // security log is silently dropped with a 401. Passing the token
      // explicitly (rather than the ambient getter) avoids a second,
      // separate race on the token itself.
      const { data: { session: currentSession } } = await supabase.auth.getSession();
      if (currentSession) {
        await logAuthEvent(
          { event: 'password-changed', device: navigator.userAgent.includes('Mobile') ? 'Mobiele browser' : 'Webbrowser' },
          { headers: { authorization: `Bearer ${currentSession.access_token}` } },
        ).catch(() => undefined);
      }
      await supabase.auth.signOut();
      setIsCompleted(true);
      setMessage('Je wachtwoord is aangepast. Je kunt nu opnieuw inloggen.');
      window.history.replaceState(null, '', appUrl('/auth/herstel-wachtwoord'));
    }
    setIsBusy(false);
  };

  return (
    <AuthShell>
      <div className="auth-kicker"><KeyRound size={15} /> wachtwoord herstellen</div>
      <h1>Een nieuw wachtwoord.</h1>
      <p>
        {isReady
          ? 'Kies een nieuw wachtwoord voor je account.'
          : 'Deze herstel-link is niet meer geldig of is al gebruikt. Vraag een nieuwe link aan.'}
      </p>
      {isReady && !isCompleted ? (
        <form className="auth-form" onSubmit={submitNewPassword}>
          <label htmlFor="new-password">Nieuw wachtwoord</label>
          <Input
            id="new-password"
            type="password"
            autoComplete="new-password"
            minLength={6}
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Minimaal 6 tekens"
          />
          <label htmlFor="confirm-password">Herhaal nieuw wachtwoord</label>
          <Input
            id="confirm-password"
            type="password"
            autoComplete="new-password"
            minLength={6}
            required
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
            placeholder="Nogmaals je wachtwoord"
          />
          <Feedback error={error} message={message} />
          <Button className="auth-submit" type="submit" disabled={isBusy}>
            {isBusy ? 'Even geduld…' : 'Wachtwoord opslaan'} <ArrowUpRight size={16} />
          </Button>
        </form>
      ) : !isCompleted ? (
        <Button className="auth-submit" type="button" onClick={() => setLocation('/auth')}>
          Vraag een nieuwe herstel-link aan <ArrowUpRight size={16} />
        </Button>
      ) : (
        <Feedback error={error} message={message} />
      )}
      {isCompleted && (
        <Button className="auth-text-button" variant="ghost" type="button" onClick={() => setLocation('/auth')}>
          <ArrowLeft size={14} /> Naar inloggen
        </Button>
      )}
    </AuthShell>
  );
}

function AuthShell({ children }: { children: React.ReactNode }) {
  const [, setLocation] = useLocation();

  return (
    <main className="auth-page">
      <div className="auth-grid" aria-hidden="true" />
      <button className="auth-brand" onClick={() => setLocation('/')} aria-label="Terug naar geslaagd.app">
        <span className="wordmark-mark" aria-hidden="true" />
        <span>geslaagd.app</span>
      </button>
      <section className="auth-card" aria-live="polite">
        {children}
      </section>
    </main>
  );
}

function AuthLoading() {
  return (
    <main className="auth-page auth-loading-page">
      <div className="auth-brand" aria-label="geslaagd.app">
        <span className="wordmark-mark" aria-hidden="true" />
        <span>geslaagd.app</span>
      </div>
      <p>Je sessie wordt beveiligd…</p>
    </main>
  );
}

function Feedback({ error, message }: { error: string; message: string }) {
  if (!error && !message) return null;

  return (
    <div className={error ? 'auth-feedback auth-feedback-error' : 'auth-feedback'}>
      {error || <><Check size={15} /> {message}</>}
    </div>
  );
}