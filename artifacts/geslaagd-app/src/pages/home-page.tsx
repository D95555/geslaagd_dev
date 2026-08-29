import { type MouseEvent, useState } from 'react';
import { useLocation } from 'wouter';
import {
  ArrowUpRight,
  BookOpen,
  ListChecks,
  Menu,
  MoveRight,
  ShieldCheck,
  X,
} from 'lucide-react';
import { Button } from '@workspace/geslaagd-momentum/components/ui/button';
import { useAuth } from '@/auth/auth-context';

const VALUES = [
  {
    icon: BookOpen,
    title: 'De kern op één plek',
    body: 'Bronnen naast de uitleg, zodat je meteen weet wat je leert en waarom.',
  },
  {
    icon: ShieldCheck,
    title: 'Altijd controleerbaar',
    body: 'Elke uitleg is te herleiden naar een bron. Geen giswerk, geen verzonnen feiten.',
  },
  {
    icon: ListChecks,
    title: 'Van vraag naar oefening',
    body: 'Dezelfde hoofdstukken leveren meteen oefenvragen en een tentamen op maat.',
  },
];

const STEPS = [
  {
    number: '01',
    title: 'Stel je vraag',
    body: 'Vertel wat je wilt begrijpen, in je eigen woorden.',
  },
  {
    number: '02',
    title: 'Vind de kern',
    body: 'Bekijk een passend voorstel met duidelijke bronnen en context.',
  },
  {
    number: '03',
    title: 'Leer verder',
    body: 'Bewaar je onderwerp en pak het de volgende keer weer op.',
  },
];

export default function HomePage() {
  const [, setLocation] = useLocation();
  const { user, isAdmin, signOut } = useAuth();
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const openAuth = () => {
    setIsMenuOpen(false);
    setLocation('/auth');
  };

  const openLearningArea = () => {
    setIsMenuOpen(false);
    setLocation('/mijn-leeromgeving');
  };

  const openAdmin = () => {
    setIsMenuOpen(false);
    setLocation('/beheer');
  };

  const leave = async () => {
    setIsMenuOpen(false);
    await signOut();
    setLocation('/');
  };

  const startLearning = () => {
    setIsMenuOpen(false);
    user ? openLearningArea() : openAuth();
  };

  const jumpTo = (event: MouseEvent<HTMLAnchorElement>, id: string) => {
    event.preventDefault();
    setIsMenuOpen(false);
    window.history.replaceState(null, '', `#${id}`);
    document.getElementById(id)?.scrollIntoView({
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
      block: 'start',
    });
  };

  return (
    <div className="site-shell">
      <header className="site-header">
        <div className="nav-wrap">
          <a className="wordmark" href="#top" data-testid="link-logo">
            <span className="wordmark-mark" aria-hidden="true" />
            <span>geslaagd.app</span>
          </a>
          <nav className="nav-links" aria-label="Hoofdnavigatie">
            <a href="#werking" onClick={(event) => jumpTo(event, 'werking')} data-testid="link-werking">
              Zo werkt het
            </a>
            <a href="#voor-wie" onClick={(event) => jumpTo(event, 'voor-wie')} data-testid="link-voor-wie">
              Voor wie
            </a>
          </nav>
          <div className="nav-actions">
            {user ? (
              <>
                {isAdmin && (
                  <button className="nav-login" onClick={openAdmin} data-testid="button-admin-nav">
                    Beheer
                  </button>
                )}
                <button className="nav-login" onClick={() => void leave()} data-testid="button-logout-nav">
                  Uitloggen
                </button>
                <button className="button-primary" onClick={openLearningArea} data-testid="button-dashboard-nav">
                  Mijn leeromgeving <ArrowUpRight size={14} strokeWidth={2.5} />
                </button>
              </>
            ) : (
              <>
                <button className="nav-login" onClick={openAuth} data-testid="button-login-nav">
                  Inloggen
                </button>
                <button className="button-primary" onClick={openAuth} data-testid="button-start-nav">
                  Aan de slag <ArrowUpRight size={14} strokeWidth={2.5} />
                </button>
              </>
            )}
            <button
              className="mobile-menu-toggle"
              onClick={() => setIsMenuOpen((open) => !open)}
              aria-label={isMenuOpen ? 'Menu sluiten' : 'Menu openen'}
              data-testid="button-menu"
            >
              {isMenuOpen ? <X size={19} /> : <Menu size={19} />}
            </button>
          </div>
        </div>
        {isMenuOpen && (
          <div className="mobile-menu" data-testid="menu-mobile">
            <a href="#werking" onClick={(event) => jumpTo(event, 'werking')}>Zo werkt het</a>
            <a href="#voor-wie" onClick={(event) => jumpTo(event, 'voor-wie')}>Voor wie</a>
            {user ? (
              <>
                <button onClick={openLearningArea} data-testid="button-mobile-dashboard">Mijn leeromgeving</button>
                {isAdmin && <button onClick={openAdmin} data-testid="button-mobile-admin">Beheer</button>}
                <button onClick={() => void leave()} data-testid="button-mobile-logout">Uitloggen</button>
              </>
            ) : (
              <button onClick={openAuth} data-testid="button-mobile-login">Inloggen</button>
            )}
          </div>
        )}
      </header>

      <main id="top">
        <section className="home-hero">
          <div className="home-hero-grid" aria-hidden="true" />
          <div className="section-wrap home-hero-inner">
            <div className="home-hero-copy">
              <p className="eyebrow">
                <span className="eyebrow-dot" /> leren met overzicht
              </p>
              <h1 className="home-hero-title">
                Van vraag naar <span className="home-accent-text">inzicht.</span>
              </h1>
              <p className="home-hero-sub">
                Geslaagd maakt lastige leerstof kleiner. Vind de kern, zie waar die vandaan komt
                en ga met vertrouwen verder.
              </p>
              <div className="home-hero-actions">
                <Button className="button-large" onClick={startLearning} data-testid="button-start-hero">
                  {user ? 'Open leeromgeving' : 'Begin gratis'} <MoveRight size={17} />
                </Button>
                <a
                  className="home-hero-link"
                  href="#werking"
                  onClick={(event) => jumpTo(event, 'werking')}
                  data-testid="link-discover-hero"
                >
                  Zo werkt het <MoveRight size={14} />
                </a>
              </div>
            </div>

            {/* A real product moment, not a generic mockup: the same citation
                tag component the study chat uses, so what a visitor sees here
                is literally what the product does. */}
            <div className="home-preview" aria-hidden="true" data-testid="visual-summary">
              <div className="home-preview-frame">
                <div className="home-preview-dots">
                  <span />
                  <span />
                  <span />
                </div>
                <div className="home-preview-question">
                  Waarom werkt een SSRI pas na een paar weken?
                </div>
                <div className="home-preview-answer">
                  SSRI&apos;s verhogen serotonine meteen, maar het therapeutisch effect ontstaat pas
                  door langzame aanpassing van receptoren in de synaps.
                  <span className="citation-tag">Bron 1</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <div className="logo-strip">
          <div className="section-wrap logo-strip-inner">
            <p>Voor leren met een helder vertrekpunt</p>
            <div className="signal-list" aria-label="Doelgroepen">
              <span><i /> 6 VWO</span>
              <span><i /> Eerstejaars</span>
              <span><i /> Bronbewust</span>
            </div>
          </div>
        </div>

        <section className="home-values" id="voor-wie">
          <div className="section-wrap">
            <div className="home-section-head">
              <p className="eyebrow">voor jou</p>
              <h2 className="home-section-title">Maak het onderwerp kleiner.</h2>
              <p className="home-section-sub">
                Voor als je veel ziet, maar nog niet weet waar je moet beginnen.
              </p>
            </div>
            <div className="home-value-grid">
              {VALUES.map((value) => (
                <article className="home-value-card" key={value.title}>
                  <value.icon className="home-value-icon" size={20} aria-hidden="true" />
                  <h3>{value.title}</h3>
                  <p>{value.body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="home-process" id="werking">
          <div className="section-wrap">
            <div className="home-section-head">
              <p className="eyebrow">zo werkt het</p>
              <h2 className="home-section-title">Drie stappen naar de kern.</h2>
              <p className="home-section-sub">Jij kiest de richting. Geslaagd helpt je verder.</p>
            </div>
            <div className="home-process-list">
              {STEPS.map((step) => (
                <div className="home-process-row" key={step.number}>
                  <span className="home-process-num" aria-hidden="true">{step.number}</span>
                  <div className="home-process-copy">
                    <h3>{step.title}</h3>
                    <p>{step.body}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="home-cta">
          <div className="section-wrap home-cta-box">
            <p className="eyebrow">klaar om te leren?</p>
            <h2 className="home-cta-title">Begin bij wat je nog niet begrijpt.</h2>
            <p className="home-cta-sub">
              Een helder vertrekpunt maakt de volgende stap vanzelf kleiner.
            </p>
            <Button className="button-large" onClick={startLearning} data-testid="button-start-cta">
              {user ? 'Open mijn leeromgeving' : 'Maak een leeromgeving'} <ArrowUpRight size={16} />
            </Button>
          </div>
        </section>
      </main>

      <footer className="footer">
        <div className="footer-wrap">
          <a className="wordmark" href="#top" data-testid="link-footer-logo">
            <span className="wordmark-mark" aria-hidden="true" />
            <span>geslaagd.app</span>
          </a>
          <small>De kern vinden. Verder leren.</small>
          <div className="footer-meta">
            <a href="#werking" onClick={(event) => jumpTo(event, 'werking')}>Zo werkt het</a>
            <span>© 2026</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
