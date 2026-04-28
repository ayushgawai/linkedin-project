import { RouterProvider } from 'react-router-dom'
import { Helmet, HelmetProvider } from 'react-helmet-async'
import { ToastProvider } from './components/ui'
import { router } from './routes'
import { ErrorBoundary } from './components/system/ErrorBoundary'
import { OfflineBanner } from './components/system/OfflineBanner'

function RouteMeta(): JSX.Element {
  const path = window.location.pathname

  const title =
    path.startsWith('/feed')
      ? 'Feed • LinkedIn'
      : path.startsWith('/in/')
        ? 'Profile • LinkedIn'
        : path.startsWith('/jobs/')
          ? 'Job • LinkedIn'
          : path.startsWith('/jobs')
            ? 'Jobs • LinkedIn'
            : path.startsWith('/messaging')
              ? 'Messaging • LinkedIn'
              : path.startsWith('/mynetwork')
                ? 'My Network • LinkedIn'
                : path.startsWith('/notifications')
                  ? 'Notifications • LinkedIn'
                    : path.startsWith('/analytics')
                    ? 'Analytics • LinkedIn'
                    : path.startsWith('/help') || path.startsWith('/learning')
                      ? 'Help Center • LinkedIn'
                    : path.startsWith('/job-posting-activity')
            ? 'Job posting • LinkedIn'
            : path.startsWith('/recruiter/ai')
                      ? 'AI Copilot • LinkedIn'
                      : path.startsWith('/recruiter')
                        ? 'Recruiter • LinkedIn'
                        : path.startsWith('/login')
                          ? 'Sign in • LinkedIn'
                          : path.startsWith('/signup')
                            ? 'Join • LinkedIn'
                            : 'LinkedIn'

  const description = 'LinkedIn Clone frontend for a distributed systems class project.'

  return (
    <Helmet>
      <title>{title}</title>
      <meta name="description" content={description} />
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:type" content="website" />
    </Helmet>
  )
}

function RoutedApp(): JSX.Element {
  return (
    <>
      <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[90] focus:rounded focus:bg-white focus:px-3 focus:py-2 focus:text-sm">
        Skip to main content
      </a>
      <OfflineBanner />
      <RouteMeta />
      <RouterProvider router={router} />
    </>
  )
}

function App() {
  return (
    <HelmetProvider>
      <ErrorBoundary>
        <ToastProvider>
          <RoutedApp />
        </ToastProvider>
      </ErrorBoundary>
    </HelmetProvider>
  )
}

export default App
