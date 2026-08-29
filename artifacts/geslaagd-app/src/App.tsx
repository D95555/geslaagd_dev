import { type FormEvent, type MouseEvent, type ReactNode, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { savePendingTopic } from '@/lib/pending-topic';
import { Button } from '@workspace/geslaagd-momentum/components/ui/button';
import { Input } from '@workspace/geslaagd-momentum/components/ui/input';
import { Toaster } from '@workspace/geslaagd-momentum/components/ui/toaster';
import { TooltipProvider } from '@workspace/geslaagd-momentum/components/ui/tooltip';
import { AuthProvider, useAuth } from '@/auth/auth-context';
import AuthPage, { PasswordRecoveryPage } from '@/pages/auth-page';
import DashboardPage from '@/pages/dashboard-page';
import StudyDetailPage from '@/pages/study-detail-page';
import SubjectDetailPage from '@/pages/subject-detail-page';
import TopicConfigPage from '@/pages/topic-config-page';
import AdminPage from '@/pages/admin-page';
import AdminCrawlPage from '@/pages/admin-crawl-page';
import AdminCrawlDetailPage from '@/pages/admin-crawl-detail-page';
import AdminCrawlPendingPage from '@/pages/admin-crawl-pending-page';
import AdminPipelinePage from '@/pages/admin-pipeline-page';
import AdminOverviewPage from '@/pages/admin-overview-page';
import SubjectCatalogPage from '@/pages/subject-catalog-page';
import SubjectStudyPage from '@/pages/subject-study-page';
import ChapterPage from '@/pages/chapter-page';
import StudyPlanPage from '@/pages/study-plan-page';
import NotFound from '@/pages/not-found';
import {
  ArrowUpRight,
  BellRing,
  LogOut,
  Menu,
  MoveRight,
  X,
} from 'lucide-react';
import {
  Route,
  Switch,
  useLocation,
  Router as WouterRouter,
} from 'wouter';

const queryClient = new QueryClient();

function Home() {
  const [, setLocation] = useLocation();
  const { user, isAdmin, signOut } = useAuth();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [prompt, setPrompt] = useState('');

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

  const startFromPrompt = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    savePendingTopic(prompt);
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
            <a href="#werking" onClick={(event) => jumpTo(event, 'werking')} data-testid="link-werking">Zo werkt het</a>
            <a href="#voor-wie" onClick={(event) => jumpTo(event, 'voor-wie')} data-testid="link-mogelijkheden"><span data-testid="link-toekomst">Voor wie</span></a>
          </nav>
          <div className="nav-actions">
            {user ? (
              <>
                {isAdmin && (
                  <button className="nav-login" onClick={openAdmin} data-testid="button-admin-nav">
                    Beheer
                  </button>
                )}
                <button className="nav-login" onClick={leave} data-testid="button-logout-nav">
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
            <a href="#werking" onClick={(event) => jumpTo(event, 'werking')} data-testid="link-mobile-werking">Zo werkt het</a>
            <a href="#voor-wie" onClick={(event) => jumpTo(event, 'voor-wie')} data-testid="link-mobile-mogelijkheden"><span data-testid="link-mobile-toekomst">Voor wie</span></a>
            {user ? (
              <>
                <button onClick={openLearningArea} data-testid="button-mobile-dashboard">Mijn leeromgeving</button>
                {isAdmin && <button onClick={openAdmin} data-testid="button-mobile-admin">Beheer</button>}
                <button onClick={leave} data-testid="button-mobile-logout">Uitloggen</button>
              </>
            ) : (
              <button onClick={openAuth} data-testid="button-mobile-login">Inloggen</button>
            )}
          </div>
        )}
      </header>

      <main id="top">
        <section className="hero">
          <div className="section-wrap hero-content">
            <div className="hero-copy-block">
              <p className="eyebrow"><span className="eyebrow-dot" /> leren met overzicht</p>
              <h1>Van vraag naar <em>inzicht.</em></h1>
              <p className="hero-copy">
                Geslaagd maakt lastige leerstof kleiner. Vind de kern, zie waar die vandaan komt en ga met vertrouwen verder.
              </p>
            </div>
            <div className="prompt-card" aria-label="Start met een onderwerp" data-testid="visual-summary">
            <form onSubmit={startFromPrompt} data-testid="form-home-prompt">
              <div className="prompt-card-heading">
                <span className="prompt-label">JOUW VOLGENDE STAP</span>
                <span className="prompt-status"><i /> klaar om te beginnen</span>
              </div>
              <label htmlFor="home-prompt">Waar wil je vandaag grip op krijgen?</label>
              <div className="prompt-input-wrap">
                <Input id="home-prompt" value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="Bijv. erfelijkheid voor mijn toets" data-testid="input-home-prompt" />
                <Button type="submit" data-testid="button-start-hero">
                  {user ? 'Open leeromgeving' : 'Begin'} <MoveRight size={17} />
                </Button>
              </div>
              <p className="prompt-note">Kies een onderwerp, bekijk de kern en leer stap voor stap.</p>
            </form>
            <a className="prompt-discover" href="#werking" onClick={(event) => jumpTo(event, 'werking')} data-testid="link-discover-hero">Zo werkt het <MoveRight size={14} /></a>
            </div>
          </div>
        </section>

        <div className="logo-strip">
          <div className="section-wrap logo-strip-inner" data-testid="card-future-boeken-en-literatuur">
            <p>Voor leren met een helder vertrekpunt</p>
            <div className="signal-list" aria-label="Doelgroepen">
              <span><i /> 6 VWO</span>
              <span><i /> Eerstejaars</span>
              <span><i /> Bronbewust</span>
            </div>
          </div>
        </div>

        <section className="section audience-section" id="voor-wie">
          <div className="section-wrap">
            <div className="section-header">
              <div>
                <p className="section-label">voor jou</p>
                <h2>Maak het onderwerp kleiner.</h2>
              </div>
              <p className="section-intro">Voor als je veel ziet, maar nog niet weet waar je moet beginnen.</p>
            </div>
            <div className="proof-row" data-testid="card-future-werkstukken-en-papers">
              <div className="proof-mark">✓</div>
              <p><strong>De kern op één plek.</strong> Met bronnen naast de uitleg, zodat je weet wat je leert.</p>
              <span className="proof-meta">helder · controleerbaar · van jou</span>
            </div>
          </div>
        </section>

        <section className="process-section" id="werking">
          <div className="section-wrap">
            <div className="section-header">
              <div>
                <p className="section-label">zo werkt het</p>
                <h2>Drie stappen naar de kern.</h2>
              </div>
              <p className="section-intro">Jij kiest de richting. Geslaagd helpt je verder.</p>
            </div>
            <div className="process-grid">
              <div className="process-line" aria-hidden="true" />
              <article className="process-step" data-testid="card-future-uitleg-op-jouw-niveau">
                <span className="step-node" aria-hidden="true" />
                <span className="step-number">STAP 01</span>
                <h3>Stel je vraag</h3>
                <p>Vertel wat je wilt begrijpen, in je eigen woorden.</p>
              </article>
              <article className="process-step" data-testid="card-future-oefenexamens">
                <span className="step-node" aria-hidden="true" />
                <span className="step-number">STAP 02</span>
                <h3>Vind de kern</h3>
                <p>Bekijk een passend voorstel met duidelijke bronnen en context.</p>
              </article>
              <article className="process-step" data-testid="card-future-huiswerkhulp">
                <span className="step-node" aria-hidden="true" />
                <span className="step-number">STAP 03</span>
                <h3>Leer verder</h3>
                <p>Bewaar je onderwerp en pak het de volgende keer weer op.</p>
              </article>
            </div>
          </div>
        </section>

        <section className="cta-section">
          <div className="section-wrap">
            <div className="cta-box" data-testid="card-future-brede-studieondersteuning">
              <p className="section-label">klaar om te leren?</p>
              <h2>Begin bij wat je nog niet begrijpt.</h2>
              <p>Een helder vertrekpunt maakt de volgende stap vanzelf kleiner.</p>
              <Button className="button-large" onClick={user ? openLearningArea : openAuth} data-testid="button-start-cta">
                {user ? 'Open mijn leeromgeving' : 'Maak een leeromgeving'} <ArrowUpRight size={16} />
              </Button>
            </div>
          </div>
        </section>
      </main>

      <footer className="footer">
        <div className="footer-wrap">
          <a className="wordmark" href="#top" data-testid="link-footer-logo"><span className="wordmark-mark" aria-hidden="true" /><span>geslaagd.app</span></a>
          <small>De kern vinden. Verder leren.</small>
          <div className="footer-meta"><a href="#werking" onClick={(event) => jumpTo(event, 'werking')}>Zo werkt het</a><span>© 2026</span></div>
        </div>
      </footer>
    </div>
  );
}

function Router() {
  return (
    <RoutedErrorBoundary>
      <BroadcastNotice />
      <Switch>
        <Route path="/auth/herstel-wachtwoord" component={PasswordRecoveryPage} />
        <Route path="/auth" component={AuthPage} />
        <Route path="/mijn-leeromgeving" component={DashboardPage} />
        <Route path="/mijn-leeromgeving/onderwerp/nieuw-vanuit-voorstel">{() => <TopicConfigPage fromProposal />}</Route>
        <Route path="/mijn-leeromgeving/onderwerp/:spaceId/bewerken">{(params) => <TopicConfigPage spaceId={params.spaceId} />}</Route>
        <Route path="/mijn-leeromgeving/vak/:selectionId/nieuw-onderwerp">{(params) => <TopicConfigPage selectionId={params.selectionId} />}</Route>
        <Route path="/mijn-leeromgeving/vak/:selectionId">{(params) => <SubjectDetailPage selectionId={params.selectionId} />}</Route>
        <Route path="/mijn-leeromgeving/:spaceId">{(params) => <StudyDetailPage spaceId={params.spaceId} />}</Route>
        <Route path="/vakken">{() => <SubjectCatalogPage />}</Route>
        <Route path="/vakken/:subjectId/hoofdstuk/:chapterId">
          {(params) => <ChapterPage subjectId={params.subjectId} chapterId={params.chapterId} />}
        </Route>
        <Route path="/vakken/:subjectId/studieplan">
          {(params) => <StudyPlanPage subjectId={params.subjectId} />}
        </Route>
        <Route path="/vakken/:subjectId">{(params) => <SubjectStudyPage subjectId={params.subjectId} />}</Route>
        <Route path="/beheer/pipeline" component={AdminPipelinePage} />
        <Route path="/beheer/accounts" component={AdminPage} />
        <Route path="/beheer" component={AdminOverviewPage} />
        <Route path="/beheer/crawl/pending" component={AdminCrawlPendingPage} />
        <Route path="/beheer/crawl/:crawlId">{(params) => <AdminCrawlDetailPage crawlId={params.crawlId} />}</Route>
        <Route path="/beheer/crawl" component={AdminCrawlPage} />
        <Route path="/" component={Home} />
        <Route component={NotFound} />
      </Switch>
    </RoutedErrorBoundary>
  );
}

function BroadcastNotice() {
  const { broadcast, dismissBroadcast } = useAuth();
  if (!broadcast) return null;
  return (
    <aside className="broadcast-notice" role="status" aria-live="polite" data-testid="broadcast-notice">
      <span className="broadcast-notice-icon" aria-hidden="true">
        <BellRing size={17} />
      </span>
      <div className="broadcast-notice-body">
        <p className="broadcast-notice-kicker">Bericht van geslaagd.app</p>
        <strong>{broadcast.title}</strong>
        <p>{broadcast.body}</p>
      </div>
      <button className="broadcast-notice-close" onClick={dismissBroadcast} aria-label="Bericht sluiten">
        <X size={16} aria-hidden="true" />
      </button>
    </aside>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
            <Router />
          </WouterRouter>
        </AuthProvider>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;