import { useEffect, type ReactNode } from 'react';
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
import AnnouncementsPage from '@/pages/announcements-page';
import AccountPage from '@/pages/account-page';
import AdminChangelogPage from '@/pages/admin-changelog-page';
import AdminAnnouncementsPage from '@/pages/admin-announcements-page';
import AdminSupportPage from '@/pages/admin-support-page';
import SubjectStudyPage from '@/pages/subject-study-page';
import ChapterPage from '@/pages/chapter-page';
import StudyPlanPage from '@/pages/study-plan-page';
import NotFound from '@/pages/not-found';
import OnboardingProfilePage from '@/pages/onboarding-profile-page';
import SocialDirectoryPage from '@/pages/social-directory-page';
import ProfilePage from '@/pages/profile-page';
import InboxPage from '@/pages/inbox-page';
import ConversationPage from '@/pages/conversation-page';
import AdminGroepsappsPage from '@/pages/admin-groepsapps-page';
import { NotificationsStack } from '@/components/shell/notifications-stack';
import {
  Route,
  Switch,
  useLocation,
  Router as WouterRouter,
} from 'wouter';

const queryClient = new QueryClient();

function Router() {
  const [location, setLocation] = useLocation();
  const { user, needsProfile } = useAuth();

  // A mandatory gate: a signed-in user without a profile is redirected here
  // regardless of what they navigated to, except the pages they'd need to
  // reach that gate in the first place (auth) or the gate itself.
  useEffect(() => {
    if (
      user &&
      needsProfile === true &&
      location !== '/onboarding/profiel' &&
      location !== '/auth' &&
      location !== '/auth/herstel-wachtwoord'
    ) {
      setLocation('/onboarding/profiel');
    }
  }, [user, needsProfile, location, setLocation]);

  return (
    <AppShell>
      <RoutedErrorBoundary>
        <NotificationsStack />
        <Switch>
          <Route path="/onboarding/profiel" component={OnboardingProfilePage} />
          <Route path="/auth/herstel-wachtwoord" component={PasswordRecoveryPage} />
          <Route path="/auth" component={AuthPage} />
          <Route path="/mijn-leeromgeving" component={DashboardPage} />
          <Route path="/support" component={SupportPage} />
          <Route path="/faq" component={FaqPage} />
          <Route path="/changelog" component={ChangelogPage} />
          <Route path="/announcements" component={AnnouncementsPage} />
          <Route path="/account" component={AccountPage} />
          <Route path="/vakken">{() => <SubjectCatalogPage />}</Route>
          <Route path="/vakken/:subjectId/hoofdstuk/:chapterId">
            {(params) => <ChapterPage subjectId={params.subjectId} chapterId={params.chapterId} />}
          </Route>
          <Route path="/vakken/:subjectId/studieplan">
            {(params) => <StudyPlanPage subjectId={params.subjectId} />}
          </Route>
          <Route path="/vakken/:subjectId">{(params) => <SubjectStudyPage subjectId={params.subjectId} />}</Route>
          <Route path="/social" component={SocialDirectoryPage} />
          <Route path="/profielen/:userId">{(params) => <ProfilePage userId={params.userId} />}</Route>
          <Route path="/gesprekken" component={InboxPage} />
          <Route path="/gesprekken/:conversationId">
            {(params) => <ConversationPage conversationId={params.conversationId} />}
          </Route>
          <Route path="/beheer/groepsapps" component={AdminGroepsappsPage} />
          <Route path="/beheer/verkenner" component={AdminVerkennerPage} />
          <Route path="/beheer/pipeline" component={AdminPipelinePage} />
          <Route path="/beheer/console" component={AdminConsolePage} />
          <Route path="/beheer/sessies" component={AdminSessionsPage} />
          <Route path="/beheer/accounts" component={AdminAccountsPage} />
          <Route path="/beheer/activatiecodes" component={AdminActivationKeysPage} />
          <Route path="/beheer/support" component={AdminSupportPage} />
          <Route path="/beheer/changelog" component={AdminChangelogPage} />
          <Route path="/beheer/aankondigingen" component={AdminAnnouncementsPage} />
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
      {/* Every surface declares its own theme; this default just avoids a flash before that runs. */}
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