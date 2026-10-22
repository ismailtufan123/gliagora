import { describe, expect, it } from 'vitest'

import { type Fetcher, FetchProblem } from './http'
import { checkLink, closedWords } from './links'
import { RobotsCache } from './robots'

describe('closedWords', () => {
  it("finds words that say a position is filled or closed, in the first sources' languages", () => {
    expect(closedWords('Thank you for your interest. This position has been filled.')).toBe(
      'position has been filled',
    )
    expect(closedWords('Die Stelle ist bereits besetzt.')).toBe('Stelle ist bereits besetzt')
    expect(closedWords('Ce poste a été pourvu')).toBe('poste a été pourvu')
    expect(closedWords('Applications are closed')).toBe('Applications are closed')
    expect(closedWords('We expect the position to be filled by a strong candidate.')).toBeNull()
  })
})

function web(
  pages: Record<string, string | number | { redirectTo: string; body: string }>,
): Fetcher {
  return {
    get: async (url, options) => {
      const parsed = new URL(url)
      if (parsed.pathname === '/robots.txt') {
        return {
          url,
          status: 200,
          contentType: 'text/plain',
          text: 'User-agent: *\nDisallow: /private/\n',
          tdmReserved: false,
        }
      }
      if (options.allow && !(await options.allow(parsed))) throw new FetchProblem('refused')
      const page = pages[url]
      if (page === undefined) throw new FetchProblem('status', 404)
      if (typeof page === 'number') throw new FetchProblem('status', page)
      if (typeof page === 'object')
        return {
          url: page.redirectTo,
          status: 200,
          contentType: 'text/html',
          text: page.body,
          tdmReserved: false,
        }
      return { url, status: 200, contentType: 'text/html', text: page, tdmReserved: false }
    },
    slowDown: () => {},
  }
}

describe('checkLink', () => {
  const pages = {
    'https://www.example.org/jobs/1':
      '<main><p>Postdoc in glia. Closing date 1 December 2026.</p></main>',
    'https://www.example.org/jobs/2': '<main><p>This vacancy is closed.</p></main>',
    'https://www.example.org/jobs/3': {
      redirectTo: 'https://www.example.org/careers/',
      body: '<main>All jobs</main>',
    },
    'https://www.example.org/jobs/5': 503,
  }
  const check = (url: string) => {
    const fetcher = web(pages)
    return checkLink(fetcher, new RobotsCache(fetcher), url)
  }

  it('tells an open page from one that says it is closed, gone, broken or elsewhere', async () => {
    expect(await check('https://www.example.org/jobs/1')).toMatchObject({
      status: 'ok',
      saysClosed: null,
    })
    expect(await check('https://www.example.org/jobs/2')).toMatchObject({
      status: 'ok',
      saysClosed: 'This vacancy is closed',
    })
    expect(await check('https://www.example.org/jobs/3')).toMatchObject({
      status: 'redirect',
      note: 'Redirects to https://www.example.org/careers/.',
    })
    expect(await check('https://www.example.org/jobs/4')).toMatchObject({
      status: 'gone',
      note: 'The page is gone (HTTP 404).',
    })
    expect(await check('https://www.example.org/jobs/5')).toMatchObject({ status: 'broken' })
  })

  it('leaves a page that robots.txt does not allow unchecked', async () => {
    expect(await check('https://www.example.org/private/1')).toMatchObject({ status: null })
  })
})

describe('closedWords: conditions are not facts (M7, third round)', () => {
  it('reads "until the position is filled" as open', () => {
    for (const text of [
      'Applications are accepted until the position is filled.',
      'The post stays open till the vacancy has been filled.',
      'Bewerbungen bis die Stelle ist besetzt.',
      'We review applications on a rolling basis unless the position has been filled earlier.',
    ]) {
      expect(closedWords(text), text).toBeNull()
    }
    expect(closedWords('Note: this position has been filled. Thank you.')).toBe(
      'position has been filled',
    )
  })
})
