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
      ? 'Feed • LinkedIn Clone'
      : path.startsWith('/in/')
        ? 'Profile • LinkedIn Clone'
        : path.startsWith('/jobs/')
          ? 'Job • LinkedIn Clone'
          : path.startsWith('/jobs')
            ? 'Jobs • LinkedIn Clone'
            : path.startsWith('/messaging')
              ? 'Messaging • LinkedIn Clone'
              : path.startsWith('/mynetwork')
                ? 'My Network • LinkedIn Clone'
                : path.startsWith('/notifications')
                  ? 'Notifications • LinkedIn Clone'
                    : path.startsWith('/analytics')
                    ? 'Analytics • LinkedIn Clone'
                    : path.startsWith('/help') || path.startsWith('/learning')
                      ? 'Help Center • LinkedIn Clone'
                    : path.startsWith('/job-posting-activity')
            ? 'Job posting • LinkedIn Clone'
            : path.startsWith('/recruiter/ai')
                      ? 'AI Copilot • LinkedIn Clone'
                      : path.startsWith('/recruiter')
                        ? 'Recruiter • LinkedIn Clone'
                        : path.startsWith('/login')
                          ? 'Sign in • LinkedIn Clone'
                          : path.startsWith('/signup')
                            ? 'Join • LinkedIn Clone'
                            : 'LinkedIn Clone'

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
