import { type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@workspace/geslaagd-momentum/components/ui/toaster';
import { TooltipProvider } from '@workspace/geslaagd-momentum/components/ui/tooltip';
import { ThemeProvider } from '@workspace/geslaagd-momentum/hooks/use-theme';
import { AuthProvider, useAuth } from '@/auth/auth-context';
import { AppShell } from '@/components/shell/app-shell';
import HomePage from '@/pages/home-page';
import AuthPage, { PasswordRecoveryPage } from '@/pages/auth-page';
import DashboardPage from '@/pages/dashboard-page';
import AdminPage from '@/pages/admin-page';
import AdminCrawlPage from '@/pages/admin-crawl-page';
import AdminCrawlDetailPage from '@/pages/admin-crawl-detail-page';
import AdminCrawlPendingPage from '@/pages/admin-crawl-pending-page';
import AdminPipelinePage from '@/pages/admin-pipeline-page';
import AdminOverviewPage from '@/pages/admin-overview-page';
import AdminVerkennerPage from '@/pages/admin-verkenner-page';
import AdminConsolePage from '@/pages/admin-console-page';
import SubjectCatalogPage from '@/pages/subject-catalog-page';
import SubjectStudyPage from '@/pages/subject-study-page';
import ChapterPage from '@/pages/chapter-page';
import StudyPlanPage from '@/pages/study-plan-page';
import NotFound from '@/pages/not-found';
import { BellRing, X } from 'lucide-react';
import {
  Route,
  Switch,
  useLocation,
  Router as WouterRouter,
} from 'wouter';

const queryClient = new QueryClient();

function Router() {
  return (
    <AppShell>
      <RoutedErrorBoundary>
        <BroadcastNotice />
        <Switch>
          <Route path="/auth/herstel-wachtwoord" component={PasswordRecoveryPage} />
          <Route path="/auth" component={AuthPage} />
          <Route path="/mijn-leeromgeving" component={DashboardPage} />
          <Route path="/vakken">{() => <SubjectCatalogPage />}</Route>
          <Route path="/vakken/:subjectId/hoofdstuk/:chapterId">
            {(params) => <ChapterPage subjectId={params.subjectId} chapterId={params.chapterId} />}
          </Route>
          <Route path="/vakken/:subjectId/studieplan">
            {(params) => <StudyPlanPage subjectId={params.subjectId} />}
          </Route>
          <Route path="/vakken/:subjectId">{(params) => <SubjectStudyPage subjectId={params.subjectId} />}</Route>
          <Route path="/beheer/verkenner" component={AdminVerkennerPage} />
          <Route path="/beheer/pipeline" component={AdminPipelinePage} />
          <Route path="/beheer/console" component={AdminConsolePage} />
          <Route path="/beheer/accounts" component={AdminPage} />
          <Route path="/beheer" component={AdminOverviewPage} />
          <Route path="/beheer/crawl/pending" component={AdminCrawlPendingPage} />
          <Route path="/beheer/crawl/:crawlId">{(params) => <AdminCrawlDetailPage crawlId={params.crawlId} />}</Route>
          <Route path="/beheer/crawl" component={AdminCrawlPage} />
          <Route path="/" component={HomePage} />
          <Route component={NotFound} />
        </Switch>
      </RoutedErrorBoundary>
    </AppShell>
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
      {/* Paper is the default; the study and admin shells declare themselves dark. */}
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <AuthProvider>
            <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
              <Router />
            </WouterRouter>
          </AuthProvider>
          <Toaster />
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;