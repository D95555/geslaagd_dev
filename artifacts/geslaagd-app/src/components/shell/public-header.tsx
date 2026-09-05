import { useState } from 'react';
import { useLocation } from 'wouter';
import { ArrowUpRight, Menu, X } from 'lucide-react';
import { useAuth } from '@/auth/auth-context';

/**
 * Header for pages reachable without logging in (FAQ, Announcements — and
 * conceptually the homepage, though that page keeps its own bespoke marketing
 * header with anchor-jump links rather than switching to this shared one).
 */
export function PublicHeader() {
  const [, setLocation] = useLocation();
  const { user, isAdmin, signOut } = useAuth();
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const go = (path: string) => {
    setIsMenuOpen(false);
    setLocation(path);
  };
  const leave = async () => {
    setIsMenuOpen(false);
    await signOut();
    setLocation('/');
  };

  return (
    <header className="site-header">
      <div className="nav-wrap">
        <a className="wordmark" href="/" onClick={(e) => { e.preventDefault(); go('/'); }}>
          <span className="wordmark-mark" aria-hidden="true" />
          <span>geslaagd.app</span>
        </a>
        <nav className="nav-links" aria-label="Hoofdnavigatie">
          <a href="/faq" onClick={(e) => { e.preventDefault(); go('/faq'); }}>Veelgestelde vragen</a>
          <a href="/announcements" onClick={(e) => { e.preventDefault(); go('/announcements'); }}>Aankondigingen</a>
        </nav>
        <div className="nav-actions">
          {user ? (
            <>
              {isAdmin && <button className="nav-login" onClick={() => go('/beheer')}>Beheer</button>}
              <button className="nav-login" onClick={() => void leave()}>Uitloggen</button>
              <button className="button-primary" onClick={() => go('/mijn-leeromgeving')}>
                Mijn leeromgeving <ArrowUpRight size={14} strokeWidth={2.5} />
              </button>
            </>
          ) : (
            <>
              <button className="nav-login" onClick={() => go('/auth')}>Inloggen</button>
              <button className="button-primary" onClick={() => go('/auth')}>
                Aan de slag <ArrowUpRight size={14} strokeWidth={2.5} />
              </button>
            </>
          )}
          <button
            className="mobile-menu-toggle"
            onClick={() => setIsMenuOpen((open) => !open)}
            aria-label={isMenuOpen ? 'Menu sluiten' : 'Menu openen'}
          >
            {isMenuOpen ? <X size={19} /> : <Menu size={19} />}
          </button>
        </div>
      </div>
      {isMenuOpen && (
        <div className="mobile-menu">
          <a href="/faq" onClick={(e) => { e.preventDefault(); go('/faq'); }}>Veelgestelde vragen</a>
          <a href="/announcements" onClick={(e) => { e.preventDefault(); go('/announcements'); }}>Aankondigingen</a>
          {user ? (
            <>
              <button onClick={() => go('/mijn-leeromgeving')}>Mijn leeromgeving</button>
              {isAdmin && <button onClick={() => go('/beheer')}>Beheer</button>}
              <button onClick={() => void leave()}>Uitloggen</button>
            </>
          ) : (
            <button onClick={() => go('/auth')}>Inloggen</button>
          )}
        </div>
      )}
    </header>
  );
}
