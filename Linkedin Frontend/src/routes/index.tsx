import { Suspense, lazy } from 'react'
import { Navigate, createBrowserRouter } from 'react-router-dom'
import { AppShell, RootLayout } from '../components/layout'
import { RecruiterLeftRail } from '../components/layout/RecruiterLeftRail'
import { Skeleton } from '../components/ui'
import { RouteErrorFallback } from './RouteErrorFallback'
import { NotificationsLeftRail } from '../features/notifications'
import { RecruiterRouteGuard } from '../features/recruiter'
import { CommunityRightRail } from '../features/community/CommunityRightRail'
import NotFoundPage from '../pages/NotFoundPage'
import InternalErrorPage from '../pages/InternalErrorPage'

const LoginPage = lazy(() => import('../features/auth/LoginPage'))
const SignupPage = lazy(() => import('../features/auth/SignupPage'))
const LandingPage = lazy(() => import('../pages/LandingPage'))
const TopContentPage = lazy(() => import('../pages/TopContentPage'))
const HelpCenterPage = lazy(() => import('../pages/HelpCenterPage'))
const DesignSystemPage = lazy(() => import('./DesignSystemPage'))
const FeedPage = lazy(() => import('../features/feed/FeedPage'))
const NewsPage = lazy(() => import('../features/news/NewsPage'))
const ProfilePage = lazy(() => import('../features/profile/ProfilePage'))
const ProfileActivityPage = lazy(() => import('../features/profile/ProfileActivityPage'))
const ProfileRightRail = lazy(() =>
  import('../features/profile/ProfileRightRail').then((m) => ({ default: m.ProfileRightRail })),
)
const JobsDiscoveryPage = lazy(() => import('../features/jobs/JobsDiscoveryPage'))
const JobDetailPage = lazy(() => import('../features/jobs/JobDetailPage'))
const JobTrackerPage = lazy(() => import('../features/jobs/JobTrackerPage'))
const JobsSearchPage = lazy(() => import('../features/jobs/JobsSearchPage'))
const NetworkPage = lazy(() => import('../features/network/NetworkPage'))
const NetworkInvitationsPage = lazy(() => import('../features/network/NetworkInvitationsPage'))
const NetworkConnectionsPage = lazy(() => import('../features/network/NetworkConnectionsPage'))
const MessagingPage = lazy(() => import('../features/messaging/MessagingPage'))
const NotificationsPage = lazy(() => import('../features/notifications/NotificationsPage'))
const AnalyticsPage = lazy(() => import('../features/analytics/AnalyticsPage'))
const RecruiterDashboardPage = lazy(() => import('../features/recruiter/RecruiterDashboardPage'))
const JobPostingActivityPage = lazy(() => import('../features/recruiter/JobPostingActivityPage'))
const RecruiterJobsPage = lazy(() => import('../features/recruiter/RecruiterJobsPage'))
const RecruiterJobFormPage = lazy(() => import('../features/recruiter/RecruiterJobFormPage'))
const RecruiterApplicantsPage = lazy(() => import('../features/recruiter/RecruiterApplicantsPage'))
const RecruiterAiPage = lazy(() => import('../features/recruiter/RecruiterAiPage'))
const SettingsPage = lazy(() => import('./RoutePlaceholders').then((m) => ({ default: m.SettingsPage })))
const SavedPage = lazy(() => import('../features/saved/SavedPage'))
const GroupsPage = lazy(() => import('../features/groups/GroupsPage'))
const GroupProfilePage = lazy(() => import('../features/groups/GroupProfilePage'))
const NewslettersPage = lazy(() => import('../features/newsletters/NewslettersPage'))
const EventsPage = lazy(() => import('../features/events/EventsPage'))
const CompanyProfilePage = lazy(() => import('../features/company/CompanyProfilePage'))
const PremiumPage = lazy(() => import('./RoutePlaceholders').then((m) => ({ default: m.PremiumPage })))

function LazyPage({ component: Component }: { component: React.ComponentType }): JSX.Element {
  return (
    <Suspense fallback={<div className="space-y-3"><Skeleton variant="rect" className="h-24" /><Skeleton variant="rect" className="h-64" /></div>}>
      <Component />
    </Suspense>
  )
}

function RootRedirect(): JSX.Element {
  return <Navigate to="/" replace />
}

export const router = createBrowserRouter([
  {
    element: <RootLayout />,
    errorElement: <RouteErrorFallback />,
    children: [
      { path: '/redirect', element: <RootRedirect />, errorElement: <RouteErrorFallback /> },
      { path: '/', element: <LazyPage component={LandingPage} />, errorElement: <RouteErrorFallback /> },
      { path: '/login', element: <LazyPage component={LoginPage} />, errorElement: <RouteErrorFallback /> },
      { path: '/signup', element: <LazyPage component={SignupPage} />, errorElement: <RouteErrorFallback /> },
      { path: '/top-content', element: <LazyPage component={TopContentPage} />, errorElement: <RouteErrorFallback /> },
      { path: '/design-system', element: <LazyPage component={DesignSystemPage} />, errorElement: <RouteErrorFallback /> },
      {
        path: '/',
        element: <AppShell protectedRoute />,
        errorElement: <RouteErrorFallback />,
        children: [
          { path: 'feed', element: <LazyPage component={FeedPage} /> },
          { path: 'news', element: <LazyPage component={NewsPage} /> },
          { path: 'jobs', element: <LazyPage component={JobsDiscoveryPage} /> },
          { path: 'jobs/tracker', element: <LazyPage component={JobTrackerPage} /> },
          { path: 'jobs/post', element: <LazyPage component={RecruiterJobFormPage} /> },
          { path: 'jobs/post/:jobId/edit', element: <LazyPage component={RecruiterJobFormPage} /> },
          { path: 'jobs/search', element: <LazyPage component={JobsSearchPage} /> },
          { path: 'jobs/:jobId/applicants', element: <LazyPage component={RecruiterApplicantsPage} /> },
          { path: 'jobs/:jobId', element: <LazyPage component={JobDetailPage} /> },
          { path: 'saved', element: <LazyPage component={SavedPage} /> },
          { path: 'premium', element: <LazyPage component={PremiumPage} /> },
        ],
      },
      {
        path: '/',
        element: <AppShell protectedRoute leftRail={null} />,
        errorElement: <RouteErrorFallback />,
        children: [
          { path: 'mynetwork', element: <LazyPage component={NetworkPage} /> },
          { path: 'mynetwork/connections', element: <LazyPage component={NetworkConnectionsPage} /> },
        ],
      },
      {
        path: '/',
        element: <AppShell protectedRoute rightRail={<CommunityRightRail />} />,
        errorElement: <RouteErrorFallback />,
        children: [
          { path: 'groups', element: <LazyPage component={GroupsPage} /> },
          { path: 'groups/:groupId', element: <LazyPage component={GroupProfilePage} /> },
          { path: 'newsletters', element: <LazyPage component={NewslettersPage} /> },
        ],
      },
      {
        path: '/',
        element: (
          <AppShell
            protectedRoute
            leftRail={null}
            rightRail={<LazyPage component={ProfileRightRail} />}
            mainColumnClassName="md:col-span-8 lg:col-span-8"
          />
        ),
        errorElement: <RouteErrorFallback />,
        children: [
          { path: 'in/:memberId', element: <LazyPage component={ProfilePage} /> },
          { path: 'in/:memberId/activity', element: <LazyPage component={ProfileActivityPage} /> },
        ],
      },
      {
        path: '/',
        element: <AppShell protectedRoute rightRail={null} mainColumnClassName="md:col-span-12 lg:col-span-9" />,
        errorElement: <RouteErrorFallback />,
        children: [{ path: 'events', element: <LazyPage component={EventsPage} /> }],
      },
      {
        path: '/',
        element: <AppShell protectedRoute leftRail={null} rightRail={null} mainColumnClassName="md:col-span-12 lg:col-span-12" />,
        errorElement: <RouteErrorFallback />,
        children: [
          { path: 'job-posting-activity', element: <LazyPage component={JobPostingActivityPage} /> },
          { path: 'recruiter/job-posting-activity', element: <Navigate to="/job-posting-activity" replace /> },
          { path: 'messaging', element: <LazyPage component={MessagingPage} /> },
          { path: 'messaging/:threadId', element: <LazyPage component={MessagingPage} /> },
          { path: 'analytics', element: <LazyPage component={AnalyticsPage} /> },
          { path: 'help', element: <LazyPage component={HelpCenterPage} /> },
          { path: 'learning', element: <LazyPage component={HelpCenterPage} /> },
          { path: 'mynetwork/invitations', element: <LazyPage component={NetworkInvitationsPage} /> },
          { path: 'companies/:companyId', element: <LazyPage component={CompanyProfilePage} /> },
          { path: 'settings', element: <LazyPage component={SettingsPage} /> },
          { path: 'settings/notifications', element: <LazyPage component={SettingsPage} /> },
        ],
      },
      {
        path: '/',
        element: <AppShell protectedRoute leftRail={<NotificationsLeftRail />} rightRail={null} mainColumnClassName="md:col-span-8 lg:col-span-8" />,
        errorElement: <RouteErrorFallback />,
        children: [{ path: 'notifications', element: <LazyPage component={NotificationsPage} /> }],
      },
      {
        path: '/',
        element: (
          <RecruiterRouteGuard>
            <AppShell protectedRoute leftRail={<RecruiterLeftRail />} rightRail={null} mainColumnClassName="md:col-span-8 lg:col-span-9" />
          </RecruiterRouteGuard>
        ),
        errorElement: <RouteErrorFallback />,
        children: [
          { path: 'recruiter', element: <LazyPage component={RecruiterDashboardPage} /> },
          { path: 'recruiter/jobs', element: <LazyPage component={RecruiterJobsPage} /> },
          { path: 'recruiter/jobs/new', element: <LazyPage component={RecruiterJobFormPage} /> },
          { path: 'recruiter/jobs/:jobId/edit', element: <LazyPage component={RecruiterJobFormPage} /> },
          { path: 'recruiter/jobs/:jobId/applicants', element: <LazyPage component={RecruiterApplicantsPage} /> },
          { path: 'recruiter/ai', element: <LazyPage component={RecruiterAiPage} /> },
        ],
      },
      { path: '/500', element: <InternalErrorPage /> },
      { path: '/404', element: <NotFoundPage /> },
      { path: '*', element: <Navigate to="/404" replace /> },
    ],
  },
])
