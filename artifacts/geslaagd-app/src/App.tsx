import { type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@workspace/geslaagd-momentum/components/ui/toaster';
import { TooltipProvider } from '@workspace/geslaagd-momentum/components/ui/tooltip';
import { ThemeProvider } from '@workspace/geslaagd-momentum/hooks/use-theme';
import { AuthProvider } from '@/auth/auth-context';
import { AppShell } from '@/components/shell/app-shell';
import HomePage from '@/pages/home-page';
import AuthPage, { PasswordRecoveryPage } from '@/pages/auth-page';
import DashboardPage from '@/pages/dashboard-page';
import AdminSessionsPage from '@/pages/admin-sessions-page';
import AdminAccountsPage from '@/pages/admin-accounts-page';
import AdminCrawlPage from '@/pages/admin-crawl-page';
import AdminAiDecisionsPage from '@/pages/admin-ai-decisions-page';
import AdminActivationKeysPage from '@/pages/admin-activation-keys-page';
import AdminPipelinePage from '@/pages/admin-pipeline-page';
import AdminOverviewPage from '@/pages/admin-overview-page';
import AdminVerkennerPage from '@/pages/admin-verkenner-page';
import AdminConsolePage from '@/pages/admin-console-page';
import SubjectCatalogPage from '@/pages/subject-catalog-page';
import SupportPage from '@/pages/support-page';
import FaqPage from '@/pages/faq-page';
import ChangelogPage from '@/pages/changelog-page';
import AdminChangelogPage from '@/pages/admin-changelog-page';
import AdminSupportPage from '@/pages/admin-support-page';
import SubjectStudyPage from '@/pages/subject-study-page';
import ChapterPage from '@/pages/chapter-page';
import StudyPlanPage from '@/pages/study-plan-page';
import NotFound from '@/pages/not-found';
import { NotificationsStack } from '@/components/shell/notifications-stack';
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
        <NotificationsStack />
        <Switch>
          <Route path="/auth/herstel-wachtwoord" component={PasswordRecoveryPage} />
          <Route path="/auth" component={AuthPage} />
          <Route path="/mijn-leeromgeving" component={DashboardPage} />
          <Route path="/support" component={SupportPage} />
          <Route path="/faq" component={FaqPage} />
          <Route path="/changelog" component={ChangelogPage} />
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
          <Route path="/beheer/sessies" component={AdminSessionsPage} />
          <Route path="/beheer/accounts" component={AdminAccountsPage} />
          <Route path="/beheer/activatiecodes" component={AdminActivationKeysPage} />
          <Route path="/beheer/support" component={AdminSupportPage} />
          <Route path="/beheer/changelog" component={AdminChangelogPage} />
          <Route path="/beheer" component={AdminOverviewPage} />
          <Route path="/beheer/crawl" component={AdminCrawlPage} />
          <Route path="/beheer/beslissingen" component={AdminAiDecisionsPage} />
          <Route path="/" component={HomePage} />
          <Route component={NotFound} />
        </Switch>
      </RoutedErrorBoundary>
    </AppShell>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      {/* Every surface in the app declares itself dark; this default just avoids a light flash before that runs. */}
      <ThemeProvider defaultTheme="dark">
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