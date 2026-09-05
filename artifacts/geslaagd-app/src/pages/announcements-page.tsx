import { useEffect, useState } from 'react';
import { listAnnouncementFeed, type AnnouncementFeedItem } from '@workspace/api-client-react';
import { Loader2, Megaphone, History } from 'lucide-react';
import { PublicHeader } from '@/components/shell/public-header';

function fmtDate(value: string) {
  return new Date(value).toLocaleDateString('nl-NL', { dateStyle: 'long' });
}

export default function AnnouncementsPage() {
  const [items, setItems] = useState<AnnouncementFeedItem[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => {
    listAnnouncementFeed()
      .then((result) => {
        setItems(result.items);
        setState('ready');
      })
      .catch(() => setState('error'));
  }, []);

  return (
    <div className="site-shell">
      <PublicHeader />
      <main>
        <section className="admin-content announcements-page section-wrap">
          <div className="admin-content-head">
            <div>
              <h1>Aankondigingen</h1>
              <p>Nieuws van het team en elke update aan geslaagd.app, nieuwste eerst.</p>
            </div>
          </div>

          {state === 'loading' ? (
            <p className="admin-empty"><Loader2 className="spin" size={15} /> Laden…</p>
          ) : state === 'error' ? (
            <p className="admin-empty">Aankondigingen konden niet geladen worden.</p>
          ) : items.length === 0 ? (
            <p className="admin-empty">Nog geen aankondigingen.</p>
          ) : (
            items.map((item) => (
              <article key={`${item.kind}-${item.id}`} className="changelog-entry">
                <div className="changelog-entry-head">
                  <strong>
                    {item.kind === 'changelog' ? <History size={14} aria-hidden="true" /> : <Megaphone size={14} aria-hidden="true" />}{' '}
                    {item.title}
                  </strong>
                  <span>{fmtDate(item.createdAt)}</span>
                </div>
                {item.kind === 'changelog' ? (
                  <ul>
                    {item.body.split('\n').filter(Boolean).map((line, index) => (
                      <li key={index}>{line}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="changelog-entry-summary">{item.body}</p>
                )}
              </article>
            ))
          )}
        </section>
      </main>
    </div>
  );
}
