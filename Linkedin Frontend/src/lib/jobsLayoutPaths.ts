/**
 * Jobs discovery (`/jobs`), post flow (`/jobs/post`), and talent search (`/jobs/search`): no app left/right columns.
 * (no global rail footer). Main column spans full width on large screens.
 */
export function isJobsHubMinimalRailsPath(pathname: string): boolean {
  const p = pathname.replace(/\/+$/, '') || '/'
  return (
    p === '/jobs' ||
    p === '/jobs/post' ||
    p === '/jobs/search' ||
    /^\/jobs\/post\/[^/]+\/edit$/.test(p) ||
    /^\/jobs\/[^/]+\/applicants$/.test(p)
  )
}
