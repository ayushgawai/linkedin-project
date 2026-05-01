import { Outlet } from 'react-router-dom'
import { ActionToastContainer } from '../ui/ActionToastContainer'

/** Wraps all routes so action toasts sit inside the router context (for <Link> navigation). */
export function RootLayout(): JSX.Element {
  return (
    <>
      <Outlet />
      <ActionToastContainer />
    </>
  )
}
