import { describe, expect, it } from 'vitest'

import { type Fetcher, FetchProblem, politeFetcher } from './http'
import { comparableText, readPostingPage } from './html'
import { readList, withoutSession } from './listing'

// Invented employers and postings only.

/** A fetcher that answers from `pages` (address → body, or a status number). */
function fakeFetcher(
  pages: Record<string, string | number>,
  contentType = 'text/html',
): Fetcher & { asked: string[] } {
  const asked: string[] = []
  return {
    asked,
    get: async (url, options) => {
      asked.push(url)
      if (options.allow && !(await options.allow(new URL(url)))) throw new FetchProblem('refused')
      const page = pages[url]
      if (page === undefined) throw new FetchProblem('status', 404)
      if (typeof page === 'number') throw new FetchProblem('status', page)
      return { url, status: 200, contentType, text: page, tdmReserved: false }
    },
    slowDown: () => {},
  }
}

const allowAll = async () => true

describe('readList: a vacancy list page', () => {
  const list = `<!doctype html><html><head><base href="https://jobs.example.org/"></head><body>
    <nav><a href="/about/">About</a></nav>
    <main>
      <h2><a href="vacancies/123-postdoc-in-glia">Postdoc in glial biology</a></h2>
      <a href="vacancies/123-postdoc-in-glia#apply">Read more</a>
      <a href="https://jobs.example.org/vacancies/124-phd?utm_source=x">PhD position</a>
      <a href="vacancies/">All vacancies</a>
      <a href="mailto:hr@example.org">Contact</a>
    </main></body></html>`

  it('takes the links that match the pattern, once each, with their longest text', async () => {
    const fetcher = fakeFetcher({ 'https://jobs.example.org/vacancies/': list })
    const { postings } = await readList(
      {
        kind: 'page',
        url: 'https://jobs.example.org/vacancies/',
        postingPattern: '^https://jobs\\.example\\.org/vacancies/\\d+-[a-z-]+(?:\\?.*)?$',
      },
      fetcher,
      allowAll,
    )
    expect(postings.map((p) => [p.url, p.title])).toEqual([
      ['https://jobs.example.org/vacancies/123-postdoc-in-glia', 'Postdoc in glial biology'],
      ['https://jobs.example.org/vacancies/124-phd?utm_source=x', 'PhD position'],
    ])
    expect(postings[1]?.canonicalUrl).toBe('https://jobs.example.org/vacancies/124-phd')
  })

  it('reads further list pages, and stops at a text-and-data-mining reservation', async () => {
    const reserved =
      '<html><head><meta name="tdm-reservation" content="1"></head><body></body></html>'
    const fetcher = fakeFetcher({
      'https://jobs.example.org/vacancies/': list,
      'https://jobs.example.org/vacancies/?page=2': reserved,
    })
    const result = await readList(
      {
        kind: 'page',
        url: 'https://jobs.example.org/vacancies/',
        moreUrls: ['https://jobs.example.org/vacancies/?page=2'],
        postingPattern: '^https://jobs\\.example\\.org/vacancies/\\d+.*$',
      },
      fetcher,
      allowAll,
    )
    expect(result.tdmReserved).toBe(true)
  })
})

describe('readList: feeds and APIs', () => {
  it('reads RSS items', async () => {
    const rss = `<?xml version="1.0"?><rss version="2.0"><channel><title>Jobs</title>
      <item><title>Doctoral researcher (m/f/d) in neuroimaging</title>
        <link>https://www.example.org/jobs/77</link>
        <description><![CDATA[<p>Join our <b>MRI</b> group.</p>]]></description>
        <pubDate>Mon, 12 Oct 2026 09:00:00 GMT</pubDate></item>
      <item><title>No link</title></item>
    </channel></rss>`
    const fetcher = fakeFetcher({ 'https://www.example.org/jobs.rss': rss }, 'application/rss+xml')
    const { postings } = await readList(
      { kind: 'rss', url: 'https://www.example.org/jobs.rss' },
      fetcher,
      allowAll,
    )
    expect(postings).toEqual([
      expect.objectContaining({
        url: 'https://www.example.org/jobs/77',
        title: 'Doctoral researcher (m/f/d) in neuroimaging',
        text: 'Join our MRI group.',
        published: '2026-10-12T09:00:00.000Z',
      }),
    ])
  })

  it('reads Atom entries', async () => {
    const atom = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><title>Jobs</title>
      <entry><title>Postdoc, systems neuroscience</title><link href="https://www.example.org/p/1"/>
      <updated>2026-10-10T00:00:00Z</updated><summary>Neural circuits.</summary></entry></feed>`
    const fetcher = fakeFetcher({ 'https://www.example.org/atom': atom }, 'application/atom+xml')
    const { postings } = await readList(
      { kind: 'rss', url: 'https://www.example.org/atom' },
      fetcher,
      allowAll,
    )
    expect(postings.map((p) => p.url)).toEqual(['https://www.example.org/p/1'])
  })

  it('reads the Greenhouse and Lever job board APIs, with the whole posting', async () => {
    const greenhouse = JSON.stringify({
      jobs: [
        {
          title: 'Research Associate, Neural Coding',
          absolute_url: 'https://boards.greenhouse.io/exampleinstitute/jobs/1',
          content: '&lt;p&gt;Study &lt;b&gt;neural coding&lt;/b&gt;.&lt;/p&gt;',
          location: { name: 'Example City' },
          updated_at: '2026-10-01T00:00:00Z',
        },
      ],
    })
    const lever = JSON.stringify([
      {
        text: 'Scientist, Brain Imaging',
        hostedUrl: 'https://jobs.lever.co/example/abc',
        descriptionPlain: 'Imaging the brain.',
        lists: [{ text: 'Requirements', content: '<li>PhD</li>' }],
        categories: { location: 'Example Town' },
        createdAt: 1790000000000,
      },
    ])
    const fetcher = fakeFetcher(
      {
        'https://boards-api.greenhouse.io/v1/boards/exampleinstitute/jobs?content=true': greenhouse,
        'https://api.lever.co/v0/postings/example?mode=json': lever,
      },
      'application/json',
    )
    const gh = await readList(
      {
        kind: 'api',
        apiFormat: 'greenhouse',
        url: 'https://boards-api.greenhouse.io/v1/boards/exampleinstitute/jobs?content=true',
      },
      fetcher,
      allowAll,
    )
    expect(gh.postings[0]).toMatchObject({
      text: 'Study neural coding.',
      complete: true,
      location: 'Example City',
    })
    const lv = await readList(
      {
        kind: 'api',
        apiFormat: 'lever',
        url: 'https://api.lever.co/v0/postings/example?mode=json',
      },
      fetcher,
      allowAll,
    )
    expect(lv.postings[0]).toMatchObject({ title: 'Scientist, Brain Imaging', complete: true })
    expect(lv.postings[0]?.text).toContain('Requirements')
  })

  it("reads the SmartRecruiters Posting API page by page, with an address for each posting's text", async () => {
    const page = (offset: number, total: number, ids: string[]) =>
      JSON.stringify({
        totalFound: total,
        offset,
        content: ids.map((id) => ({
          id,
          name: `Post ${id}`,
          location: { city: 'Example', country: 'us' },
        })),
      })
    const base = 'https://api.smartrecruiters.com/v1/companies/ExampleU/postings'
    const fetcher = fakeFetcher(
      {
        [`${base}?limit=100&offset=0`]: page(
          0,
          101,
          Array.from({ length: 100 }, (_, i) => String(i + 1)),
        ),
        [`${base}?limit=100&offset=100`]: page(100, 101, ['101']),
      },
      'application/json',
    )
    const { postings } = await readList(
      { kind: 'api', apiFormat: 'smartrecruiters', url: base },
      fetcher,
      allowAll,
    )
    expect(postings).toHaveLength(101)
    expect([postings[0], postings[100]].map((p) => [p?.url, p?.detailUrl, p?.location])).toEqual([
      ['https://jobs.smartrecruiters.com/ExampleU/1', `${base}/1`, 'Example, US'],
      ['https://jobs.smartrecruiters.com/ExampleU/101', `${base}/101`, 'Example, US'],
    ])
  })

  it('refuses an answer that is not what the source says it is', async () => {
    const fetcher = fakeFetcher({ 'https://www.example.org/api': '<html>' }, 'text/html')
    await expect(
      readList(
        { kind: 'api', apiFormat: 'lever', url: 'https://www.example.org/api' },
        fetcher,
        allowAll,
      ),
    ).rejects.toMatchObject({ name: 'ListProblem', kind: 'not-json' })
  })
})

describe('readPostingPage', () => {
  it('reads the JobPosting data, the title and the text without the page chrome', () => {
    const page = readPostingPage(`<html><head><title>Postdoc | Example University</title>
      <script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"Organization"},{"@type":"JobPosting","title":"Postdoctoral Fellow in Synaptic Plasticity","validThrough":"2026-11-30T23:59:00+01:00","datePosted":"2026-10-01","jobLocation":{"@type":"Place","address":{"addressLocality":"Example City","addressCountry":"DE"}}}]}</script>
      </head><body><header>Menu</header><nav>Home Jobs</nav><main><h1>Postdoctoral Fellow</h1>
      <p>We study LTP in the hippocampus.</p><p>Closing date: 30 November 2026</p></main><footer>© 2026</footer></body></html>`)
    expect(page.title).toBe('Postdoctoral Fellow in Synaptic Plasticity')
    expect(page.jobPosting).toMatchObject({
      validThrough: '2026-11-30T23:59:00+01:00',
      location: 'Example City, DE',
    })
    expect(page.text).toBe(
      'Postdoctoral Fellow\nWe study LTP in the hippocampus.\nClosing date: 30 November 2026',
    )
  })

  it('falls back to the h1, and notes a text-and-data-mining reservation', () => {
    const page = readPostingPage(
      '<html><head><meta name="tdm-reservation" content="1"></head><body><h1>PhD position</h1><p>Text</p></body></html>',
    )
    expect(page.title).toBe('PhD position')
    expect(page.tdmReserved).toBe(true)
  })

  it('compares pages by their text without digits', () => {
    expect(comparableText('<main><p>Terms, version 2026.1</p></main>')).toBe(
      comparableText('<main><p>Terms, version 2027.4</p></main>'),
    )
  })
})

describe('politeFetcher', () => {
  const clock = () => {
    let now = 0
    const slept: number[] = []
    return {
      now: () => now,
      sleep: async (ms: number) => {
        slept.push(ms)
        now += ms
      },
      slept,
    }
  }
  const respond = (body: string, init: ResponseInit = {}) =>
    new Response(body, { status: 200, ...init })

  it('names itself, sends no cookies and waits between two requests to one host', async () => {
    const seen: Array<{ url: string; init: RequestInit }> = []
    const c = clock()
    const fetcher = politeFetcher({
      clock: c,
      hostDelayMs: 3000,
      fetchImpl: (async (url: URL, init: RequestInit) => {
        seen.push({ url: String(url), init })
        return respond('ok', { headers: { 'content-type': 'text/html; charset=utf-8' } })
      }) as never,
    })
    await fetcher.get('https://a.example.org/1', { accept: 'text/html', maxBytes: 100 })
    await fetcher.get('https://b.example.org/1', { accept: 'text/html', maxBytes: 100 })
    await fetcher.get('https://a.example.org/2', { accept: 'text/html', maxBytes: 100 })
    expect(c.slept).toEqual([3000])
    const headers = seen[0]?.init.headers as Record<string, string>
    expect(headers['User-Agent']).toMatch(
      /^Gliagora-Monitor\/1\.0 \(\+https:\/\/gliagora\.com\/en\/about\/#reading-employers-pages\)$/,
    )
    expect(seen[0]?.init.credentials).toBe('omit')
    expect(seen[0]?.init.redirect).toBe('manual')
  })

  it('follows a redirect only where `allow` lets it, and refuses large answers', async () => {
    const fetcher = politeFetcher({
      clock: clock(),
      fetchImpl: (async (url: URL) =>
        String(url).endsWith('/old')
          ? new Response(null, { status: 301, headers: { location: '/private/new' } })
          : respond('x'.repeat(200))) as never,
    })
    await expect(
      fetcher.get('https://a.example.org/old', {
        accept: 'text/html',
        maxBytes: 1000,
        allow: async (url) => !url.pathname.startsWith('/private/'),
      }),
    ).rejects.toMatchObject({ kind: 'refused' })
    await expect(
      fetcher.get('https://a.example.org/big', { accept: 'text/html', maxBytes: 100 }),
    ).rejects.toMatchObject({
      kind: 'too-large',
    })
  })

  it('decodes the charset the answer names', async () => {
    const fetcher = politeFetcher({
      clock: clock(),
      fetchImpl: (async () =>
        new Response(new Uint8Array([0x4d, 0xfc, 0x6e, 0x63, 0x68, 0x65, 0x6e]), {
          headers: { 'content-type': 'text/html; charset=iso-8859-1' },
        })) as never,
    })
    expect(
      (await fetcher.get('https://a.example.org/', { accept: 'text/html', maxBytes: 100 })).text,
    ).toBe('München')
  })
})

describe('withoutSession', () => {
  it('drops the session a server put into an address', () => {
    expect(withoutSession('https://www.example.org/recruit/view.do;jsessionid=ABC123?idx=7')).toBe(
      'https://www.example.org/recruit/view.do?idx=7',
    )
    expect(withoutSession('https://www.example.org/jobs/?id=4&PHPSESSID=x9')).toBe(
      'https://www.example.org/jobs/?id=4',
    )
    expect(withoutSession('https://www.example.org/jobs/4')).toBe('https://www.example.org/jobs/4')
  })
})
