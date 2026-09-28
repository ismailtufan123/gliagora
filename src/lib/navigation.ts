import { jobsHref } from '@/lib/filters/jobs'
import type { WindowKey } from '@/lib/site'
import { paths } from '@/lib/site'

// Mega-menu entries of the windows that have sub-sections (PLAN §2.3). Filters use the shared
// filter model (PLAN §2.4): links to a list that has it come from its helpers, so they are
// canonical (the other lists join as they are built). Labels are in messages/{locale}.json under
// `menus.{window}.{key}`. Still to come: "Subscribe to the calendar" (Events) with the iCal feed
// (M8).

const events = paths.window('events')
const resources = paths.window('resources')

export const MEGA_MENUS = {
  jobs: [
    { key: 'all', href: jobsHref() },
    { key: 'msc', href: jobsHref({ type: ['msc'] }) },
    { key: 'phd', href: jobsHref({ type: ['phd'] }) },
    { key: 'postdoc', href: jobsHref({ type: ['postdoc'] }) },
    { key: 'researchStaff', href: jobsHref({ type: ['research-staff'] }) },
    { key: 'facultyPi', href: jobsHref({ type: ['faculty-pi'] }) },
    { key: 'industry', href: jobsHref({ type: ['industry'] }) },
    { key: 'closingSoon', href: jobsHref({ deadline: '14d' }) },
    { key: 'map', href: paths.section('map') },
    { key: 'suggest', href: paths.section('suggest') },
  ],
  events: [
    { key: 'all', href: events },
    { key: 'conferences', href: `${events}?etype=conference` },
    { key: 'schools', href: `${events}?etype=school,course` },
    { key: 'seminars', href: `${events}?etype=online-seminar` },
    { key: 'month', href: `${events}?view=month` },
  ],
  resources: [
    { key: 'datasets', href: `${resources}?type=dataset-repository` },
    { key: 'tools', href: `${resources}?type=software-tool` },
    { key: 'atlases', href: `${resources}?type=atlas-reference` },
    { key: 'statistics', href: `${resources}?type=guide-tutorial&method=statistics-data-science` },
    { key: 'learn', href: paths.section('learn') },
    { key: 'benchToBedside', href: paths.section('benchToBedside') },
  ],
} as const satisfies Partial<Record<WindowKey, readonly { key: string; href: string }[]>>

export type MenuWindow = keyof typeof MEGA_MENUS

export function hasMenu(key: WindowKey): key is MenuWindow {
  return key in MEGA_MENUS
}
