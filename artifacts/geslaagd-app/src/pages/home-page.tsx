import { type MouseEvent, useState } from 'react';
import { useLocation } from 'wouter';
import {
  ArrowUpRight,
  BookOpen,
  ChevronRight,
  FileText,
  GraduationCap,
  Highlighter,
  Landmark,
  Link2,
  ListChecks,
  Menu,
  PencilLine,
  Route,
  ShieldCheck,
  X,
} from 'lucide-react';
import { Button } from '@workspace/geslaagd-momentum/components/ui/button';
import { useSurfaceTheme } from '@workspace/geslaagd-momentum/hooks/use-theme';
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

const CAPABILITIES = [
  {
    icon: FileText,
    title: 'Een samenvatting per hoofdstuk',
    body: 'Geen dertig tabbladen meer: de kern van elk hoofdstuk, helder op een rij.',
  },
  {
    icon: Highlighter,
    title: 'Kernpunten om snel te herhalen',
    body: 'Het overzicht dat je erbij pakt vlak voor een toets of tentamen.',
  },
  {
    icon: PencilLine,
    title: 'Oefenvragen die aansluiten op de stof',
    body: 'Geen losse vragenbank — oefening die precies bij dit hoofdstuk hoort.',
  },
  {
    icon: GraduationCap,
    title: 'Een proeftentamen bij grote hoofdstukken',
    body: 'Voor de onderdelen die er echt toe doen, oefen je alsof het al menens is.',
  },
  {
    icon: Route,
    title: 'Een studieplan dat meebeweegt',
    body: 'Zie in één oogopslag wat je al af hebt en wat nog moet.',
  },
  {
    icon: Link2,
    title: 'Bronnen die je zelf kunt natrekken',
    body: 'Elke uitleg is te herleiden naar waar hij vandaan komt.',
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
  useSurfaceTheme('light');

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
              Mogelijkheden
            </a>
            <a href="/faq" onClick={(event) => { event.preventDefault(); setLocation('/faq'); }} data-testid="link-faq">
              Veelgestelde vragen
            </a>
            <a
              href="/announcements"
              onClick={(event) => { event.preventDefault(); setLocation('/announcements'); }}
              data-testid="link-announcements"
            >
              Aankondigingen
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
            <a href="#voor-wie" onClick={(event) => jumpTo(event, 'voor-wie')}>Mogelijkheden</a>
            <a href="/faq" onClick={(event) => { event.preventDefault(); setLocation('/faq'); }}>Veelgestelde vragen</a>
            <a href="/announcements" onClick={(event) => { event.preventDefault(); setLocation('/announcements'); }}>Aankondigingen</a>
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
                <span className="eyebrow-dot" /> voor de laatste loodjes
              </p>
              <h1 className="home-hero-title">
                Studeren met <span className="home-accent-text">voorsprong.</span>
              </h1>
              <p className="home-hero-sub">
                Geslaagd brengt het internet terug tot wat jij moet weten. Slim verzameld,
                kritisch bekeken en helder samengevat — voor 6 VWO en het begin van je bachelor.
              </p>
              <div className="home-hero-actions">
                <Button className="button-large" onClick={startLearning} data-testid="button-start-hero">
                  {user ? 'Open leeromgeving' : 'Probeer geslaagd.app'} <ArrowUpRight size={17} />
                </Button>
                <a
                  className="home-hero-link"
                  href="#werking"
                  onClick={(event) => jumpTo(event, 'werking')}
                  data-testid="link-discover-hero"
                >
                  Ontdek hoe het werkt <ChevronRight size={14} />
                </a>
              </div>
              <p className="home-hero-microcopy">AI-ondersteund. Altijd gecontroleerd. Geen ruis.</p>
            </div>

            {/* A real product moment, not a generic mockup: the same source
                list students see once a chapter summary is ready. */}
            <div className="home-preview" aria-hidden="true" data-testid="visual-summary">
              <div className="home-preview-frame">
                <div className="home-preview-titlebar">
                  <div className="home-preview-dots">
                    <span />
                    <span />
                    <span />
                  </div>
                  <span className="home-preview-url">geslaagd.app / jouw overzicht</span>
                </div>
                <p className="home-preview-label">samenvatting klaar</p>
                <h3 className="home-preview-heading">De Nederlandse rechtsstaat</h3>
                <div className="home-preview-sources">
                  <div className="home-preview-source-row">
                    <Landmark className="home-preview-source-icon" size={16} />
                    <div className="home-preview-source-copy">
                      <span className="home-preview-source-title">Rijksoverheid · Grondwet</span>
                      <span className="home-preview-source-meta">bron 01 · gecontroleerd</span>
                    </div>
                    <span className="home-preview-badge">· relevant</span>
                  </div>
                  <div className="home-preview-source-row">
                    <BookOpen className="home-preview-source-icon" size={16} />
                    <div className="home-preview-source-copy">
                      <span className="home-preview-source-title">Examenprogramma maatschappijleer</span>
                      <span className="home-preview-source-meta">bron 02 · gecontroleerd</span>
                    </div>
                    <span className="home-preview-badge">· relevant</span>
                  </div>
                </div>
                <div className="home-preview-footer-bar">
                  <span>samenvatting · 6 min leestijd</span>
                  <span className="home-preview-cta">klaar om te leren</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <div className="logo-strip">
          <div className="section-wrap logo-strip-inner">
            <p>Gebouwd voor nieuwsgierige mensen</p>
            <div className="signal-list" aria-label="Doelgroepen">
              <span><i /> 6 VWO</span>
              <span><i /> Eindexamen</span>
              <span><i /> Eerstejaars bachelor</span>
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

        <section className="home-capabilities">
          <div className="section-wrap">
            <div className="home-section-head">
              <p className="eyebrow">wat je krijgt</p>
              <h2 className="home-section-title">Per vak meteen bruikbaar.</h2>
              <p className="home-section-sub">
                Geen kale samenvatting: elk hoofdstuk levert meteen het hele pakket op.
              </p>
            </div>
            <div className="home-capability-grid">
              {CAPABILITIES.map((capability) => (
                <div className="home-capability-row" key={capability.title}>
                  <capability.icon className="home-capability-icon" size={17} aria-hidden="true" />
                  <div>
                    <h3>{capability.title}</h3>
                    <p>{capability.body}</p>
                  </div>
                </div>
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
          <p className="home-cta-note">
            Geslaagd is een project van één student, niet van een bedrijf — gebouwd voor
            medestudenten. Een eventuele eenmalige bijdrage gaat rechtstreeks naar hosting, niet naar winst.
          </p>
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
