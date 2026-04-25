import { RailAdCard } from '../ads'
import { RailFooter } from './RailFooter'

/** Same promoted slot as the main right rail, pinned to the Northwind Analytics house ad on Saved. */
export function SavedPromotedRail(): JSX.Element {
  return (
    <aside className="sticky top-[68px] hidden self-start md:block md:col-span-4 lg:col-span-3">
      <div className="space-y-2">
        <RailAdCard pinnedAdId="ad-northwind-data" />
      </div>
      <RailFooter />
    </aside>
  )
}
