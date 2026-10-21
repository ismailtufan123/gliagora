import type {
  CollectionBeforeChangeHook,
  CollectionBeforeDeleteHook,
  CollectionBeforeValidateHook,
  CollectionConfig,
  Field,
} from 'payload'
import { validations } from 'payload'

import { nobody, signedIn } from '@/lib/access'
import { isHttpUrl } from '@/lib/jobs/url'
import {
  API_FORMATS,
  FAILURES_FLAGGED,
  SOURCE_KINDS,
  SOURCE_SCHEDULES,
  TERMS_AUTOMATION,
  isAutomatic,
  postingIdProblem,
  postingPatternProblem,
  postingTemplateProblem,
} from '@/lib/sources/kinds'
import type { Source } from '@/payload-types'

type SourceData = Partial<Source>

/** What Payload passes to a field's validate function, as far as these rules use it. */
type Options = { data: SourceData; siblingData?: Record<string, unknown> }

const isKind =
  (...kinds: string[]) =>
  (data: Partial<SourceData> | undefined) =>
    kinds.includes(String(data?.kind))

/**
 * Why the source needs an editor's attention, from what the monitor last found (the dashboard
 * also shows manual sources that are due for a look, which depends on the day).
 */
export function attentionReasons(source: SourceData): string[] {
  const reasons: string[] = []
  if (!isAutomatic(source.kind)) return reasons
  if ((source.consecutiveFailures ?? 0) >= FAILURES_FLAGGED) {
    reasons.push(`its last ${source.consecutiveFailures} runs failed`)
  }
  if (source.robotsAllowed === false)
    reasons.push('robots.txt (or the site) does not allow reading it')
  if (source.termsChangedAt) reasons.push('its terms of use have changed: read them again')
  return reasons
}

// The fields set by the monitor are left as they are when an editor saves; the flag and its reason
// follow from them. "Looked at today" sets the day of an editor's look at a manual source, and a
// new day of the terms check accepts the terms as they are now.
const prepare: CollectionBeforeValidateHook<Source> = ({ data }) => {
  if (!data) return data
  if (typeof data.url === 'string') data.url = data.url.trim()
  if (typeof data.postingPattern === 'string')
    data.postingPattern = data.postingPattern.trim() || null
  if (typeof data.ignoredNames === 'string') data.ignoredNames = data.ignoredNames.trim() || null
  for (const key of ['postingIdPattern', 'postingUrlTemplate'] as const) {
    if (typeof data[key] === 'string') data[key] = data[key].trim() || null
  }
  return data
}

const settle: CollectionBeforeChangeHook<Source> = ({ data, originalDoc, operation }) => {
  const saved: SourceData = operation === 'update' ? (originalDoc ?? {}) : {}
  if (data.lookedToday) {
    data.lookedAt = new Date().toISOString()
    data.lookedToday = false
  }
  const checked = data.termsCheckedAt ?? saved.termsCheckedAt ?? null
  if (checked && checked !== saved.termsCheckedAt) {
    // The editor has read the terms again: the version the monitor last saw is the one read.
    data.termsReviewedHash = data.termsHash ?? saved.termsHash ?? null
    data.termsChangedAt = null
  }
  const merged = { ...saved, ...data }
  const reasons = attentionReasons(merged)
  data.needsAttention = reasons.length > 0
  data.attentionReason = reasons.length > 0 ? reasons.join('; ') : null
  return data
}

// The postings a source's monitor saw and the records of its runs belong to it (the candidates it
// made keep their decisions and lose only the link, which the database clears).
const deletePostings: CollectionBeforeDeleteHook = async ({ id, req }) => {
  for (const collection of ['source-postings', 'source-runs'] as const) {
    await req.payload.delete({ collection, where: { source: { equals: id } }, depth: 0, req })
  }
}

const readOnlyDate = (name: string, label: string, description?: string): Field => ({
  name,
  label,
  type: 'date',
  access: { create: () => false, update: () => false },
  admin: {
    position: 'sidebar',
    readOnly: true,
    date: { pickerAppearance: 'dayAndTime', displayFormat: 'd MMM yyyy, HH:mm' },
    description,
  },
})

const readOnlyNumber = (name: string, label: string, description?: string): Field => ({
  name,
  label,
  type: 'number',
  defaultValue: 0,
  access: { create: () => false, update: () => false },
  admin: { position: 'sidebar', readOnly: true, description },
})

const httpUrl = (value: string | null | undefined) =>
  !value || isHttpUrl(value) || 'Enter a full address, e.g. https://www.example.org/jobs/.'

// PLAN §5.1, §6.1, §6.2 (D52): every place where positions come from. A monitor reads the feeds,
// APIs and vacancy list pages once a day (src/lib/monitors/), where robots.txt and the terms of
// use allow it; editors check the manual ones. The monitor only makes candidates (status New):
// nothing is published without an editor.
export const Sources: CollectionConfig = {
  slug: 'sources',
  labels: { singular: 'Source', plural: 'Sources' },
  admin: {
    group: 'Sources',
    useAsTitle: 'name',
    defaultColumns: [
      'name',
      'kind',
      'active',
      'needsAttention',
      'lastSuccessAt',
      'candidatesFound',
    ],
    listSearchableFields: ['name', 'url'],
    description:
      'Where positions come from (PLAN §6.1). A monitor reads the feeds, APIs, vacancy list pages and sitemaps once a day, where robots.txt and the terms allow it, and puts new neuroscience postings into the review queue as New candidates. Manual sources are checked by an editor: open the page, add what is new as candidates, then tick "Looked at today". Sources "Left out" are kept only to record why they are not used (see their terms and notes). Job boards are never sources.',
    pagination: { defaultLimit: 50 },
  },
  defaultSort: 'name',
  access: {
    read: signedIn,
    create: signedIn,
    update: signedIn,
    // Rarely needed (pause it instead): the candidates it made keep their decisions.
    delete: signedIn,
    readVersions: nobody,
  },
  hooks: { beforeValidate: [prepare], beforeChange: [settle], beforeDelete: [deletePostings] },
  fields: [
    { name: 'name', type: 'text', required: true, maxLength: 200 },
    {
      name: 'institution',
      type: 'relationship',
      relationTo: 'institutions',
      admin: {
        description:
          "The employer whose positions it lists. New candidates get it; change it on a candidate whose posting is another institute's.",
      },
    },
    {
      type: 'row',
      fields: [
        {
          name: 'kind',
          type: 'select',
          required: true,
          defaultValue: 'manual',
          options: SOURCE_KINDS.map(({ value, label }) => ({ value, label })),
        },
        {
          name: 'apiFormat',
          label: 'API',
          type: 'select',
          options: API_FORMATS.map(({ value, label }) => ({ value, label })),
          validate: (value: string | null | undefined, options: Options) =>
            options.data.kind === 'api' && !value
              ? 'Choose which API it is.'
              : validations.select(value as never, options as never),
          admin: { condition: isKind('api') },
        },
        {
          name: 'schedule',
          type: 'select',
          required: true,
          defaultValue: 'daily',
          options: SOURCE_SCHEDULES.map(({ value, label }) => ({ value, label })),
          admin: {
            description:
              'How often it is read: by the monitor (at most once a day), or by an editor.',
          },
        },
      ],
    },
    {
      name: 'url',
      label: 'Address',
      type: 'text',
      required: true,
      maxLength: 2000,
      validate: (value: string | null | undefined, options: Options) =>
        httpUrl(value) === true ? validations.text(value, options as never) : httpUrl(value),
      admin: {
        description:
          'The feed, the API address, the vacancy list page or the sitemap; for a manual source, the page an editor opens.',
      },
    },
    {
      name: 'moreUrls',
      label: 'More list pages',
      type: 'array',
      maxRows: 9,
      admin: {
        condition: isKind('page'),
        description: "The list's further pages, if it has several (read in this order).",
      },
      fields: [
        {
          name: 'url',
          label: 'Address',
          type: 'text',
          required: true,
          maxLength: 2000,
          validate: httpUrl,
        },
      ],
    },
    {
      name: 'postingPattern',
      label: 'Addresses of postings',
      type: 'text',
      maxLength: 500,
      validate: (value: string | null | undefined, options: Options) => {
        if (!value) {
          if (options.data.kind === 'sitemap') return 'A sitemap needs the pattern of its postings.'
          return options.data.kind === 'page' && !options.data.postingUrlTemplate
            ? 'A list page needs the pattern of its postings.'
            : true
        }
        return postingPatternProblem(value) ?? true
      },
      admin: {
        condition: isKind('page', 'rss', 'api', 'sitemap'),
        description:
          'A regular expression for the addresses of the postings on the list, e.g. ^https://www\\.example\\.org/jobs/\\d+/?$. Needed for a list page (unless its postings are built from IDs, below) and a sitemap; for a feed or an API it keeps only the items whose address matches.',
      },
    },
    {
      type: 'row',
      admin: { condition: isKind('page') },
      fields: [
        {
          name: 'postingIdPattern',
          label: "IDs in the list's links",
          type: 'text',
          maxLength: 300,
          validate: (value: string | null | undefined, options: Options) => {
            if (!value)
              return options.data.postingUrlTemplate ? 'Give the pattern of the IDs too.' : true
            return postingIdProblem(value) ?? true
          },
          admin: {
            description:
              "For a list whose links are not addresses (javascript:viewTheJobSpec('188371')): a regular expression with the ID in one group, e.g. viewTheJobSpec\\('(\\d+)'\\).",
          },
        },
        {
          name: 'postingUrlTemplate',
          label: 'Address of a posting from its ID',
          type: 'text',
          maxLength: 1000,
          validate: (value: string | null | undefined, options: Options) => {
            if (!value)
              return options.data.postingIdPattern ? 'Give the address with {id} too.' : true
            return postingTemplateProblem(value) ?? true
          },
          admin: {
            description:
              'The address that shows a posting by GET, with {id} where its ID goes. Check it in a browser first.',
          },
        },
      ],
    },
    {
      name: 'allNeuroscience',
      label: 'Every posting here is in neuroscience',
      type: 'checkbox',
      defaultValue: false,
      admin: {
        condition: isKind('page', 'rss', 'api', 'sitemap'),
        description:
          "A neuroscience institute's own list: keep every posting, without checking its words for neuroscience.",
      },
    },
    {
      name: 'ignoredNames',
      label: 'Names that do not count as neuroscience',
      type: 'textarea',
      maxLength: 2000,
      admin: {
        condition: isKind('page', 'rss', 'api', 'sitemap'),
        description:
          "One a line, e.g. Department of Clinical Neuroscience: names of the employer's units that its ads repeat whatever their field. The monitor leaves them out of a posting's text (not its title) before it looks for neuroscience words. Names written with capitals (Department of …, … Institute) and the institution's own names are left out without being listed here.",
      },
    },
    {
      name: 'active',
      label: 'Monitor on',
      type: 'checkbox',
      defaultValue: true,
      admin: {
        condition: isKind('page', 'rss', 'api', 'sitemap'),
        description: 'Read by the monitor on its schedule. Untick to pause it.',
      },
    },
    {
      type: 'collapsible',
      label: 'Terms of use and robots.txt',
      fields: [
        {
          name: 'termsUrl',
          label: 'Terms of use',
          type: 'text',
          maxLength: 2000,
          validate: httpUrl,
          admin: { description: 'The address of the terms of use (or legal notice) that apply.' },
        },
        {
          type: 'row',
          fields: [
            {
              name: 'termsAutomation',
              label: 'Automated access',
              type: 'select',
              required: true,
              defaultValue: 'not-stated',
              options: TERMS_AUTOMATION.map(({ value, label }) => ({ value, label })),
              validate: (value: string | null | undefined, options: Options) =>
                value === 'forbids' && isAutomatic(options.data.kind)
                  ? 'Its terms forbid automated access: set the kind to "Checked by an editor".'
                  : validations.select(value as never, options as never),
            },
            {
              name: 'termsCheckedAt',
              label: 'Terms checked',
              type: 'date',
              admin: {
                date: { pickerAppearance: 'dayOnly', displayFormat: 'd MMM yyyy' },
                description: 'The day an editor last read them.',
              },
            },
          ],
        },
        {
          name: 'termsNote',
          label: 'What the terms say',
          type: 'textarea',
          maxLength: 2000,
          admin: { description: 'The clause relied on, briefly.' },
        },
        {
          type: 'row',
          fields: [
            {
              name: 'robotsAllowed',
              label: 'robots.txt allows it',
              type: 'checkbox',
              access: { create: () => false, update: () => false },
              admin: {
                readOnly: true,
                description:
                  'Checked before every run; a source that robots.txt refuses is not read.',
              },
            },
            {
              name: 'robotsCheckedAt',
              label: 'robots.txt checked',
              type: 'date',
              access: { create: () => false, update: () => false },
              admin: {
                readOnly: true,
                date: { pickerAppearance: 'dayAndTime', displayFormat: 'd MMM yyyy, HH:mm' },
              },
            },
          ],
        },
        {
          name: 'robotsNote',
          label: 'robots.txt',
          type: 'text',
          access: { create: () => false, update: () => false },
          admin: { readOnly: true, description: 'What the monitor found in it.' },
        },
        {
          name: 'termsChangedAt',
          label: 'Terms changed',
          type: 'date',
          access: { create: () => false, update: () => false },
          admin: {
            readOnly: true,
            date: { pickerAppearance: 'dayAndTime', displayFormat: 'd MMM yyyy, HH:mm' },
            description:
              'When the monitor found the terms page changed since an editor last read it. Read them again, then set the day under "Terms checked".',
          },
        },
        // The text hash of the terms page as the monitor last read it, and as it was when an editor
        // last read the terms; they differ when the terms changed.
        { name: 'termsHash', type: 'text', admin: { hidden: true } },
        { name: 'termsReviewedHash', type: 'text', admin: { hidden: true } },
        // When the monitor last read the terms page (once a week).
        { name: 'termsFetchedAt', type: 'date', admin: { hidden: true } },
      ],
    },
    {
      name: 'notes',
      type: 'textarea',
      maxLength: 4000,
      admin: { description: 'For editors: what to look for, where the neuroscience posts are.' },
    },

    // Sidebar: the editor's look at a manual source, and the monitor's record.
    {
      name: 'lookedToday',
      label: 'Looked at today',
      type: 'checkbox',
      defaultValue: false,
      admin: {
        position: 'sidebar',
        condition: isKind('manual'),
        description: 'Tick and save after you have checked the page.',
      },
    },
    {
      name: 'lookedAt',
      label: 'Last looked at',
      type: 'date',
      index: true,
      admin: {
        position: 'sidebar',
        condition: isKind('manual'),
        readOnly: true,
        date: { pickerAppearance: 'dayAndTime', displayFormat: 'd MMM yyyy, HH:mm' },
      },
    },
    {
      name: 'needsAttention',
      label: 'Needs attention',
      type: 'checkbox',
      defaultValue: false,
      index: true,
      access: { create: () => false, update: () => false },
      admin: { position: 'sidebar', readOnly: true },
    },
    {
      name: 'attentionReason',
      label: 'Why',
      type: 'text',
      access: { create: () => false, update: () => false },
      admin: {
        position: 'sidebar',
        readOnly: true,
        condition: (data) => Boolean(data?.needsAttention),
      },
    },
    readOnlyDate('lastRunAt', 'Last run'),
    readOnlyDate('lastSuccessAt', 'Last success'),
    readOnlyNumber(
      'consecutiveFailures',
      'Failed runs in a row',
      `At ${FAILURES_FLAGGED}, the source is flagged on the dashboard.`,
    ),
    {
      name: 'lastError',
      label: 'Last error',
      type: 'text',
      access: { create: () => false, update: () => false },
      admin: { position: 'sidebar', readOnly: true },
    },
    readOnlyNumber('lastRunFound', 'New candidates, last run'),
    readOnlyNumber('candidatesFound', 'New candidates, in all'),
  ],
}
