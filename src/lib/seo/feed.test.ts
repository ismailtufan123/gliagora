import { createTranslator } from 'next-intl'
import { describe, expect, it } from 'vitest'

import messages from '../../../messages/en.json'

import {
  FEED_SIZE,
  type FeedJob,
  type FeedTexts,
  feedDescription,
  feedItem,
  feedJobs,
  rssXml,
} from './feed'

const NOW = new Date('2026-09-28T12:00:00Z')

const t = createTranslator({ locale: 'en', messages, namespace: 'jobs' })
const TEXTS: FeedTexts = {
  institution: (name) => t('feed.institution', { name }),
  location: (place) => t('feed.location', { place }),
  place: (city, country) => t('place', { city, country }),
  deadline: (date) => t('feed.deadline', { date }),
  rolling: t('feed.rolling'),
  untilFilled: t('feed.untilFilled'),
}

let nextId = 1
const job = (shortId: string, fields: Partial<FeedJob> = {}): FeedJob => ({
  id: nextId++,
  shortId,
  path: `/en/jobs/phd-position-${shortId}/`,
  title: `PhD position ${shortId}`,
  originalLanguage: 'en',
  institution: {
    id: 1,
    name: 'Karolinska Institutet',
    path: '/en/institutions/karolinska-institutet-056d84691/',
    urlId: '056d84691',
  },
  city: 'Solna',
  country: 'Sweden',
  positionType: null,
  subfields: [],
  methods: [],
  modelSystems: [],
  originalUrl: 'https://careers.example.org/1',
  status: 'published',
  deadlineKind: 'fixed',
  deadlineDate: '2026-11-27T12:00:00.000Z',
  deadlineTz: 'Europe/Stockholm',
  deadlineAt: '2026-11-27T23:00:00.000Z',
  expiredAt: null,
  withdrawnAt: null,
  summary: 'Study how astrocytes shape synaptic signalling in the mouse cortex.',
  publishedAt: '2026-09-20T09:00:00.000Z',
  ...fields,
})

describe('feedJobs', () => {
  it('keeps open jobs only, the most recently published first', () => {
    const jobs = [
      job('aaaaa', { publishedAt: '2026-09-01T00:00:00.000Z' }),
      job('bbbbb', { publishedAt: '2026-09-25T00:00:00.000Z' }),
      job('ccccc', { deadlineKind: 'rolling', deadlineAt: null, deadlineDate: null }),
      // Closed at the end of its deadline day, before the hourly check marks it expired.
      job('ddddd', { deadlineAt: '2026-09-28T11:00:00.000Z', publishedAt: '2026-09-27T00:00:00Z' }),
      job('eeeee', { status: 'expired', publishedAt: '2026-09-27T00:00:00Z' }),
      job('fffff', { status: 'withdrawn', publishedAt: '2026-09-27T00:00:00Z' }),
      job('ggggg', { status: 'draft', publishedAt: null }),
      job('hhhhh', { status: 'in_review', publishedAt: null }),
    ]
    expect(feedJobs(jobs, NOW).map((j) => j.shortId)).toEqual(['bbbbb', 'ccccc', 'aaaaa'])
  })

  it('lists at most 50', () => {
    expect(FEED_SIZE).toBe(50)
    const many = Array.from({ length: 60 }, (_, i) =>
      job(`x${String(i).padStart(4, '0')}`, {
        publishedAt: new Date(Date.UTC(2026, 8, 1, i)).toISOString(),
      }),
    )
    const listed = feedJobs(many, NOW)
    expect(listed).toHaveLength(50)
    expect(listed[0]?.shortId).toBe('x0059')
  })
})

describe('feedDescription', () => {
  it('gives our summary, the institution, the place and the deadline day, in plain text', () => {
    expect(feedDescription(job('aaaaa'), TEXTS)).toBe(
      'Study how astrocytes shape synaptic signalling in the mouse cortex. Institution: Karolinska Institutet. Location: Solna, Sweden. Deadline: 27 Nov 2026.',
    )
  })

  it('names rolling and until-filled deadlines, and leaves out what a job does not have', () => {
    expect(
      feedDescription(
        job('bbbbb', { deadlineKind: 'rolling', deadlineDate: null, city: null, summary: null }),
        TEXTS,
      ),
    ).toBe('Institution: Karolinska Institutet. Location: Sweden. Rolling deadline.')
    expect(
      feedDescription(job('ccccc', { deadlineKind: 'until-filled', deadlineDate: null }), TEXTS),
    ).toMatch(/Open until filled\.$/)
  })
})

describe('rssXml', () => {
  const channel = {
    title: 'Latest neuroscience positions – Gliagora | Neuroscience',
    description: 'The newest positions',
    link: 'https://gliagora.com/en/jobs/',
    self: 'https://gliagora.com/en/jobs/feed.xml',
    language: 'en',
  }

  it('writes RSS 2.0 with atom:link rel="self", dates in RFC 822 and items that link to Gliagora', () => {
    const item = feedItem(job('k3f9a'), TEXTS)
    const xml = rssXml(channel, [item])
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n')).toBe(true)
    expect(xml).toContain('<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">')
    expect(xml).toContain('<title>Latest neuroscience positions – Gliagora | Neuroscience</title>')
    expect(xml).toContain('<link>https://gliagora.com/en/jobs/</link>')
    expect(xml).toContain('<language>en</language>')
    expect(xml).toContain(
      '<atom:link href="https://gliagora.com/en/jobs/feed.xml" rel="self" type="application/rss+xml"/>',
    )
    expect(xml).toContain('<title>PhD position k3f9a</title>')
    expect(xml).toContain('<link>https://gliagora.com/en/jobs/phd-position-k3f9a/</link>')
    // The permanent address (short ID only), so a corrected title does not repeat the item.
    expect(xml).toContain('<guid isPermaLink="true">https://gliagora.com/en/jobs/k3f9a/</guid>')
    expect(xml).toContain('<pubDate>Sun, 20 Sep 2026 09:00:00 GMT</pubDate>')
    expect(xml).toContain('<description>Study how astrocytes')
    expect(xml.endsWith('  </channel>\n</rss>\n')).toBe(true)
  })

  it('escapes titles and descriptions and sends no HTML', () => {
    const item = feedItem(
      job('zzzzz', {
        title: 'Postdoc <em>R&D</em> "neuro" in Côte d’Ivoire',
        summary: 'Models of <b>glia</b> & neurons.',
      }),
      TEXTS,
    )
    const xml = rssXml(channel, [item])
    expect(xml).toContain(
      '<title>Postdoc &lt;em&gt;R&amp;D&lt;/em&gt; &quot;neuro&quot; in Côte d’Ivoire</title>',
    )
    expect(xml).toContain('<description>Models of &lt;b&gt;glia&lt;/b&gt; &amp; neurons.')
    expect(xml).not.toMatch(/<(em|b)>/)
    expect(xml).not.toContain('CDATA')
  })

  it('writes a valid empty channel', () => {
    const xml = rssXml(channel, [])
    expect(xml).not.toContain('<item>')
    expect(xml).toContain('<atom:link ')
  })

  it('writes no lastBuildDate, so no date moves back in time when a job leaves the feed', () => {
    // B closes between the two readings: the channel changes, yet no date of the jobs still
    // listed is later than before.
    const jobs = [
      job('aaaaa', { publishedAt: '2026-09-20T09:00:00.000Z' }),
      job('bbbbb', { publishedAt: '2026-09-25T09:00:00.000Z', deadlineAt: '2026-10-01T22:00:00Z' }),
    ]
    const feed = (now: Date) =>
      rssXml(
        channel,
        feedJobs(jobs, now).map((open) => feedItem(open, TEXTS)),
      )
    const before = feed(NOW)
    const after = feed(new Date('2026-10-02T00:00:00Z'))
    expect(before.match(/<item>/g)).toHaveLength(2)
    expect(after.match(/<item>/g)).toHaveLength(1)
    for (const xml of [before, after]) expect(xml).not.toContain('lastBuildDate')
  })
})
