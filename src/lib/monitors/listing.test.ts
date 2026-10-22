import { gzipSync } from 'node:zlib'

import { describe, expect, it } from 'vitest'

import { type Fetcher, FetchProblem, politeFetcher } from './http'
import { comparableText, pageTitleFor, readPostingPage } from './html'
import { readList, titleFromAddress, withoutSession } from './listing'

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

  it("prefers a JobPosting description longer than the page's own text, unescaped twice if needed", () => {
    // More than 200 characters of navigation, the limit before this round.
    const chrome = 'Skip to content. Search jobs. Sign in. Saved jobs. Job alerts. '.repeat(4)
    const description =
      '&lt;p&gt;We record &lt;b&gt;cortical neurons&lt;/b&gt; in behaving mice and study how circuits learn. The position is funded for three years and includes training in two-photon imaging, electrophysiology and the analysis of large recordings, with a mentoring programme. Applications from all backgrounds are welcome.&lt;/p&gt;'
    const page = readPostingPage(
      `<html><head><script type="application/ld+json">${JSON.stringify({
        '@type': 'JobPosting',
        title: 'Postdoc',
        description,
      })}</script></head><body><main><p>${chrome}</p></main></body></html>`,
    )
    expect(page.text).toBe(
      'We record cortical neurons in behaving mice and study how circuits learn. The position is funded for three years and includes training in two-photon imaging, electrophysiology and the analysis of large recordings, with a mentoring programme. Applications from all backgrounds are welcome.',
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

describe('readPostingPage: chrome without its own element (M7, second round)', () => {
  it("leaves out menus, breadcrumbs, cookie notices, other postings' teasers and hidden text", () => {
    const page = readPostingPage(`<html><body>
      <div class="parent-menu"><ul class="submenu"><li>Centre for Restorative Neurotechnology</li></ul></div>
      <div class="mobileOpenSubMenu">Neuroscience of Disease Programme</div>
      <ol class="breadcrumbs"><li>Brain research</li></ol>
      <div id="cookie-banner">We use cookies on our neuroscience pages.</div>
      <div role="navigation">Neural circuits</div>
      <h1>Bioinformatician in cancer genomics</h1>
      <p>Analyse tumour genomes.</p>
      <p style="display: none">Neuroscience brain</p>
      <section class="related-vacancies component"><div class="vacancy-item">PhD in vascular neurology</div></section>
      </body></html>`)
    expect(page.text).toBe('Bioinformatician in cancer genomics\nAnalyse tumour genomes.')
  })

  it('keeps a wrapper whose layout class names a menu but that holds text, not links', () => {
    const page = readPostingPage(`<html><body><header><h1>Example University</h1></header>
      <div class="layout-content sidebar-menu-layout"><h2>Postdoc in glial biology</h2>
      <p>${'We study astrocytes and their calcium signals in the living brain. '.repeat(6)}</p></div>
      <div class="main-menu">${'<a href="/x">Departments and institutes</a> '.repeat(12)}</div></body></html>`)
    expect(page.text).toMatch(/^Postdoc in glial biology\nWe study astrocytes/)
    expect(page.text).not.toMatch(/Departments/)
  })

  it('compares terms pages by the rules they were first hashed with', () => {
    expect(
      comparableText('<main><div class="breadcrumbs">Home</div><p>Terms of use</p></main>'),
    ).toBe('home terms of use')
  })

  it('reads a posting that a form holds, and leaves out a search form (M7, third round)', () => {
    // CoreHR (Oxford) wraps the whole posting in one form.
    const page =
      readPostingPage(`<html><head><style id="antiClickjack">body{display:none !important;}</style>
      <title>Job Details</title></head><body>
      <form name="search"><input name="q"><label>Search vacancies</label></form>
      <form name="ecoreJobSpecificationForm"><table><tr><td>
      <h2>Postdoctoral Research Scientist in Neural Circuits</h2>
      <p>${'We record from cortical neurons in behaving mice and model their dynamics. '.repeat(8)}</p>
      <p>Closing Date &amp; Time : 19-Nov-2026 12:00</p></td></tr></table></form></body></html>`)
    expect(page.text).toMatch(/^Postdoctoral Research Scientist in Neural Circuits\nWe record/)
    expect(page.text).toMatch(/Closing Date & Time : 19-Nov-2026 12:00$/)
    expect(page.text).not.toMatch(/Search vacancies/)
  })

  it("never takes the page's own containers, or a wrapper that holds the posting, for chrome", () => {
    const page = readPostingPage(`<html><body class="menu-closed"><div class="menu-push-wrapper">
      <h1>Postdoc in glial biology</h1><p>We study astrocytes.</p></div></body></html>`)
    expect(page.text).toBe('Postdoc in glial biology\nWe study astrocytes.')
  })

  it('gives every title the page has, in order', () => {
    const page = readPostingPage(`<html><head><title>Example Institute</title>
      <meta property="og:title" content="Example Institute"></head>
      <body><h1>Research assistant in the [name] lab</h1></body></html>`)
    expect(page.titles).toEqual([
      { from: 'og:title', value: 'Example Institute' },
      { from: 'h1', value: 'Research assistant in the [name] lab' },
      { from: 'title', value: 'Example Institute' },
    ])
  })
})

describe('pageTitleFor (M7, second round)', () => {
  const titles = (...pairs: Array<[string, string]>) => ({
    titles: pairs.map(([from, value]) => ({ from: from as 'h1', value })),
  })

  it("takes the page's title that agrees with the list's link, not the site's name", () => {
    const page = titles(
      ['og:title', 'Example Institute for Brain Research, Beijing (EIBR, Beijing)'],
      ['h1', 'Research Assistant Opportunities: Join the [name] Lab at EIBR'],
      ['title', 'Example Institute for Brain Research, Beijing (EIBR, Beijing)'],
    )
    expect(
      pageTitleFor(
        page,
        'Research Assistant Opportunities: Join the [name] Lab at EIBR NEW Example Institute | 1 | Full-Time',
      ),
    ).toEqual({
      from: 'h1',
      value: 'Research Assistant Opportunities: Join the [name] Lab at EIBR',
    })
    // Without the h1, the list's link names the posting better than the site's name.
    expect(
      pageTitleFor(
        titles(['og:title', 'Example Institute for Brain Research, Beijing']),
        'Postdoctoral Researcher in Systems Neuroscience',
      ),
    ).toBeNull()
  })

  it("prefers the title without the site's name, and keeps the page's title for a short link", () => {
    expect(
      pageTitleFor(
        titles(['og:title', 'Postdoc in glia | Example Foundation'], ['h1', 'Postdoc in glia']),
        'Postdoc in glia',
      ),
    ).toEqual({ from: 'h1', value: 'Postdoc in glia' })
    // A page's title that only adds the site's name to the link's: the link, unless cut short.
    const suffixed = titles([
      'og:title',
      'AI Research Scientist II  Office of the CTO, Careers At Example Institute',
    ])
    expect(pageTitleFor(suffixed, 'AI Research Scientist II - Office of the CTO')).toBeNull()
    expect(pageTitleFor(suffixed, 'AI Research Scientist II - Office of…')).toEqual(
      suffixed.titles[0],
    )
    expect(pageTitleFor(titles(['h1', 'Postdoc in glial biology']), 'Read more')).toEqual({
      from: 'h1',
      value: 'Postdoc in glial biology',
    })
    // Neither a one-word heading nor a title that only adds the site's name to the link's.
    expect(
      pageTitleFor(
        titles(
          ['og:title', 'Postdoctoral Researcher in Neuroimaging - Example University'],
          ['h1', 'Neuroimaging'],
        ),
        'Postdoctoral Researcher in Neuroimaging',
      ),
    ).toBeNull()
    expect(
      pageTitleFor(
        titles(
          [
            'json-ld',
            'Postdoctoral Researcher in Cognitive Neuroscience (m/f/d), Example University',
          ],
          ['h1', 'Postdoc'],
        ),
        'Postdoc in cognitive neuroscience',
      )?.from,
    ).toBe('json-ld')
    // A <title> alone never beats the list (Oxford's CoreHR: "Job Details").
    expect(pageTitleFor(titles(['title', 'Job Details']), 'Read more')).toBeNull()
    // Without a list title (a sitemap's), the page's first.
    expect(pageTitleFor(titles(['title', 'Postdoc']), null)).toEqual({
      from: 'title',
      value: 'Postdoc',
    })
  })
})

describe('readList: what a list row says (M7, second round)', () => {
  const source = {
    kind: 'page' as const,
    url: 'https://jobs.example.org/board/',
    postingPattern: '^https://jobs\\.example\\.org/board/view\\?idx=\\d+$',
  }

  it("reads a table's status and its Closing Date and Posted columns", async () => {
    const list = `<table><thead><tr><th>Status</th><th>Title</th><th>Closing Date</th><th>Posted</th></tr></thead>
      <tbody>
        <tr><td> In progress </td><td><a href="/board/view?idx=3">2026-10 Postdoc in synaptic biology</a></td><td>2026-11-06</td><td>01.10.2026</td></tr>
        <tr><td> Closed </td><td><a href="/board/view?idx=2">2024-14 Postdoc in synaptic biology</a></td><td>2024-12-26</td><td></td></tr>
      </tbody></table>`
    const { postings } = await readList(source, fakeFetcher({ [source.url]: list }), allowAll)
    expect(postings).toMatchObject([
      {
        title: '2026-10 Postdoc in synaptic biology',
        listedDeadline: { label: 'Closing Date', value: '2026-11-06' },
        published: '01.10.2026',
      },
      { title: '2024-14 Postdoc in synaptic biology', closedInList: 'Closed' },
    ])
    expect(postings[0]?.closedInList).toBeUndefined()
  })

  it('reads no row that holds other postings, nor a label before a date, as a closed mark', async () => {
    const list = `<table><tr><td>Vacancies</td><td>
      <p><a href="/board/view?idx=1">Postdoc in synaptic biology</a></p>
      <p><a href="/board/view?idx=2">PhD in glia</a> <b>Filled</b></p></td></tr></table>
      <ul><li><a href="/board/view?idx=3">박사후연구원 모집</a><span><em>마감</em> 2026.11.30</span></li></ul>`
    const { postings } = await readList(source, fakeFetcher({ [source.url]: list }), allowAll)
    expect(postings.map((p) => p.closedInList)).toEqual([undefined, undefined, undefined])
  })

  it('lines columns up with their headings across a colspan, and skips rows that do not', async () => {
    const list = `<table><tr><th colspan="2">Position</th><th>Closing date</th><th>Posted</th></tr>
      <tr><td>R-1</td><td><a href="/board/view?idx=1">Postdoc starting 1 March 2027</a></td><td>30.11.2026</td><td>01.10.2026</td></tr>
      <tr><td colspan="4"><a href="/board/view?idx=2">PhD in glia</a> 15.12.2026</td></tr></table>`
    const { postings } = await readList(source, fakeFetcher({ [source.url]: list }), allowAll)
    expect(postings[0]).toMatchObject({
      listedDeadline: { label: 'Closing date', value: '30.11.2026' },
      published: '01.10.2026',
    })
    expect(postings[1]?.listedDeadline).toBeUndefined()
  })

  it('reads long lists in linear time', async () => {
    const rows = Array.from(
      { length: 1500 },
      (_, n) =>
        `<tr><td>Open</td><td><a href="/board/view?idx=${n}">Postdoc ${n}</a></td><td>2026-11-06</td></tr>`,
    ).join('')
    const one = `<ul><li>${Array.from({ length: 400 }, (_, n) => `<a href="/board/view?idx=${n + 5000}">PhD ${n}</a>`).join(' ')}</li></ul>`
    const list = `<table><tr><th>Status</th><th>Title</th><th>Closing date</th></tr>${rows}</table>${one}`
    const started = performance.now()
    const { postings } = await readList(source, fakeFetcher({ [source.url]: list }), allowAll)
    expect(postings).toHaveLength(1900)
    expect(performance.now() - started).toBeLessThan(5000)
  })

  it('reads a mark only while it is shown', async () => {
    const card = (
      idx: number,
      hidden: [string, string],
    ) => `<div class="list-item"><a href="/board/view?idx=${idx}">
      <div class="a-title">Postdoc ${idx} in neural circuits</div>
      <div class="mark"><span style="${hidden[0]}">NEW</span><span style="${hidden[1]}">Expired</span></div></a></div>`
    const list = card(1, ['', 'display:none;']) + card(2, ['display:none;', ''])
    const { postings } = await readList(source, fakeFetcher({ [source.url]: list }), allowAll)
    expect(postings.map((p) => [p.title, p.closedInList])).toEqual([
      ['Postdoc 1 in neural circuits NEW', undefined],
      ['Postdoc 2 in neural circuits Expired', 'Expired'],
    ])
  })
})

describe('readList: a sitemap of posting pages (M7, second round)', () => {
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
    <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/TR/xhtml11/xhtml11_schema.html">
      <url><loc>https://example.wd1.myworkdayjobs.com/External/job/Main-Campus/Postdoctoral-Researcher-in-Neuroscience_R-4673</loc>
        <xhtml:link rel="alternate" hreflang="en-US" href="https://example.wd1.myworkdayjobs.com/en-US/External/job/Main-Campus/Postdoctoral-Researcher-in-Neuroscience_R-4673"/></url>
      <url><loc>https://example.wd1.myworkdayjobs.com/External/job/Main-Campus/Senior-Accountant_JR324-1</loc></url>
      <url><loc>https://example.wd1.myworkdayjobs.com/External/about-us</loc></url>
    </urlset>`
  const source = {
    kind: 'sitemap' as const,
    url: 'https://example.wd1.myworkdayjobs.com/External/siteMap.xml',
    postingPattern: '^https://example\\.wd1\\.myworkdayjobs\\.com/External/job/[^/]+/[^/]+$',
  }

  it("takes the pattern's posting pages, with a title from each address", async () => {
    const fetcher = fakeFetcher({ [source.url]: sitemap }, 'application/xml')
    const { postings } = await readList(source, fetcher, allowAll)
    expect(postings.map((p) => [p.url.split('/').pop(), p.title])).toEqual([
      ['Postdoctoral-Researcher-in-Neuroscience_R-4673', 'Postdoctoral Researcher in Neuroscience'],
      ['Senior-Accountant_JR324-1', 'Senior Accountant'],
    ])
  })

  it('follows a sitemap index to its sitemaps, each checked by robots.txt', async () => {
    const index = `<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
      <sitemap><loc>https://example.wd1.myworkdayjobs.com/External/jobs-1.xml</loc></sitemap>
      <sitemap><loc>https://example.wd1.myworkdayjobs.com/private/jobs-2.xml</loc></sitemap>
    </sitemapindex>`
    const fetcher = fakeFetcher(
      {
        [source.url]: index,
        'https://example.wd1.myworkdayjobs.com/External/jobs-1.xml': sitemap,
      },
      'application/xml',
    )
    const allow = async (url: URL) => !url.pathname.startsWith('/private/')
    await expect(readList(source, fetcher, allow)).rejects.toMatchObject({ kind: 'refused' })
    const open = fakeFetcher(
      {
        [source.url]: index.replace('/private/jobs-2.xml', '/External/jobs-1.xml'),
        'https://example.wd1.myworkdayjobs.com/External/jobs-1.xml': sitemap,
      },
      'application/xml',
    )
    const { postings } = await readList(source, open, allowAll)
    expect(postings).toHaveLength(2)
  })

  it('refuses an answer that is not a sitemap', async () => {
    const fetcher = fakeFetcher({ [source.url]: '<html><body>Jobs</body></html>' })
    await expect(readList(source, fetcher, allowAll)).rejects.toMatchObject({
      kind: 'not-a-sitemap',
    })
  })

  it('names nothing from an address that is only an ID or a hash', () => {
    expect(
      titleFromAddress(
        'https://jobs.example.org/jobposting/b81b8738522c80716f442f9e9a235f88667fcfba',
      ),
    ).toBe('')
    expect(
      titleFromAddress(
        'https://jobs.example.org/en/jobs/101667/postdoctoral-researcher-fmx-laminar-fmri-406920269',
      ),
    ).toBe('postdoctoral researcher fmx laminar fmri')
    expect(titleFromAddress('https://jobs.example.org/jobs/12345')).toBe('')
  })
})

describe('readList: a list that names its postings by an ID (M7, second round)', () => {
  const list = `<html><body><table>
    <tr><td><a class="big" href="javascript:viewTheJobSpec('188838')">Postdoctoral Research Assistant in Retinal Gene Therapy</a></td></tr>
    <tr><td><a href="javascript:viewTheJobSpec('188838')">show more details -></a></td></tr>
    <tr><td><a href="javascript:viewTheJobSpec('188882')">Technician</a></td></tr>
    <tr><td><a href="javascript:applyForJob('188882', 'N')">Apply</a></td></tr>
    <tr><td><a href="/pls/recruit/help">Help</a></td></tr>
  </table></body></html>`
  const source = {
    kind: 'page' as const,
    url: 'https://hr.example.org/pls/recruit/search',
    postingIdPattern: "^javascript:viewTheJobSpec\\('(\\d+)'\\)$",
    postingUrlTemplate:
      'https://hr.example.org/pls/recruit/jobspec?p_company=10&p_recruitment_id={id}',
  }

  it('builds addresses from IDs only for a list page, whatever other fields hold', async () => {
    const fetcher = fakeFetcher(
      { 'https://hr.example.org/feed': '<rss><channel></channel></rss>' },
      'application/rss+xml',
    )
    const { postings } = await readList(
      {
        kind: 'rss',
        url: 'https://hr.example.org/feed',
        postingIdPattern: 'viewJob(\\d+',
        postingUrlTemplate: 'https://hr.example.org/view?id={id}',
      },
      fetcher,
      allowAll,
    )
    expect(postings).toEqual([])
  })

  it('builds each posting address from the ID in its links', async () => {
    const fetcher = fakeFetcher({ [source.url]: list })
    const { postings } = await readList(source, fetcher, allowAll)
    expect(postings.map((p) => [p.url, p.title])).toEqual([
      [
        'https://hr.example.org/pls/recruit/jobspec?p_company=10&p_recruitment_id=188838',
        'Postdoctoral Research Assistant in Retinal Gene Therapy',
      ],
      [
        'https://hr.example.org/pls/recruit/jobspec?p_company=10&p_recruitment_id=188882',
        'Technician',
      ],
    ])
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

  it('reads an answer that names no charset as UTF-8, or as Windows-1252 when it is not UTF-8', async () => {
    const answer = (bytes: number[]) =>
      politeFetcher({
        clock: clock(),
        fetchImpl: (async () =>
          new Response(new Uint8Array(bytes), {
            headers: { 'content-type': 'text/html' },
          })) as never,
      }).get('https://a.example.org/', { accept: 'text/html', maxBytes: 100 })
    // "Institute’s" in Windows-1252, then "Müller" in UTF-8.
    expect((await answer([0x49, 0x6e, 0x73, 0x74, 0x92, 0x73])).text).toBe('Inst’s')
    expect((await answer([0x4d, 0xc3, 0xbc, 0x6c, 0x6c, 0x65, 0x72])).text).toBe('Müller')
    // UTF-8 with one stray byte stays UTF-8.
    expect((await answer([0x4d, 0xc3, 0xbc, 0x6c, 0x92, 0x72])).text).toBe('Mül\ufffdr')
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

describe('politeFetcher: a gzipped sitemap', () => {
  it('unpacks it when asked, within the size limit', async () => {
    const xml = `<urlset>${'<url><loc>https://jobs.example.org/1</loc></url>'.repeat(40)}</urlset>`
    const fetcher = politeFetcher({
      hostDelayMs: 0,
      fetchImpl: (async () =>
        new Response(gzipSync(xml), {
          status: 200,
          headers: { 'content-type': 'application/x-gzip' },
        })) as never,
    })
    const fetched = await fetcher.get('https://jobs.example.org/sitemap.xml.gz', {
      accept: 'application/xml',
      maxBytes: 4000,
      gunzip: true,
    })
    expect(fetched.text).toBe(xml)
    // Small packed, too large unpacked.
    expect(gzipSync(xml).byteLength).toBeLessThan(500)
    await expect(
      fetcher.get('https://jobs.example.org/sitemap.xml.gz', {
        accept: 'application/xml',
        maxBytes: 500,
        gunzip: true,
      }),
    ).rejects.toMatchObject({ kind: 'too-large' })
  })
})
