import { useEffect, useState } from 'react';
import { getChangelog, type ChangelogEntry } from '@workspace/api-client-react';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/auth/auth-context';

function fmtDate(value: string) {
  return new Date(value).toLocaleDateString('nl-NL', { dateStyle: 'long' });
}

export default function ChangelogPage() {
  const { user, isLoading } = useAuth();
  const [entries, setEntries] = useState<ChangelogEntry[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');

  // Gated on the session, not just mount: on a fresh/direct page load this
  // otherwise fires before Supabase restores the session from storage,
  // sending an unauthenticated request that 401s and is never retried.
  useEffect(() => {
    if (isLoading) return;
    if (!user) { setState('error'); return; }
    getChangelog()
      .then((result) => {
        setEntries(result.entries);
        setState('ready');
      })
      .catch(() => setState('error'));
  }, [isLoading, user?.id]);

  return (
    <section className="admin-content changelog-page">
      <div className="admin-content-head">
        <div>
          <h1>Changelog</h1>
          <p>Wat er is veranderd aan geslaagd.app, nieuwste eerst.</p>
        </div>
      </div>

      {state === 'loading' ? (
        <p className="admin-empty"><Loader2 className="spin" size={15} /> Changelog laden…</p>
      ) : state === 'error' ? (
        <p className="admin-empty">Changelog kon niet geladen worden.</p>
      ) : entries.length === 0 ? (
        <p className="admin-empty">Nog geen changelog-items.</p>
      ) : (
        entries.map((entry) => (
          <article key={entry.id} className="changelog-entry">
            <div className="changelog-entry-head">
              <strong>{entry.version}</strong>
              <span>{fmtDate(entry.releasedAt)}</span>
            </div>
            <p className="changelog-entry-summary">{entry.summary}</p>
            <ul>
              {entry.bullets.map((bullet, index) => (
                <li key={index}>{bullet}</li>
              ))}
            </ul>
          </article>
        ))
      )}
    </section>
  );
}
