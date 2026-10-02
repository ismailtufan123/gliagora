import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import { CONTENT_PAGES } from '../lib/content'
import type { IsDraft } from '../lib/public-pages'
import { DOC_FILE, FIRST_APPROVALS, changedLinks, linksReview } from './m2-links-review-doc'

// docs/m2-links-review.md: how the texts' links read in the M2 state (D41, D50), for the operator
// to check before approving a text (deploy/README.md, "Switching to the M2 state").

const ONLY_ABOUT: IsDraft = (key) => key !== 'about'

describe('changedLinks', () => {
  it('lists the links that become an email or their words alone, with their sentence', () => {
    const markdown = [
      'Intro. Use the [report form](/en/report/) or [email](mailto:hello@gliagora.com). Next one.',
      '',
      '- See the [cookies page](/en/legal/cookies/#x) (KVKK Art. 5) for details;',
      '- read [About](/en/about/) and [ROR](https://ror.org/).',
      '',
      '| Page | Link |',
      '| --- | --- |',
      '| Terms | [terms](/en/legal/terms/) |',
    ].join('\n')
    expect(changedLinks(markdown, ONLY_ABOUT)).toEqual([
      {
        text: 'report form',
        href: '/en/report/',
        becomes: 'email',
        sentence: 'Use the [report form] or [email].',
      },
      {
        text: 'cookies page',
        href: '/en/legal/cookies/#x',
        becomes: 'words',
        sentence: 'See the [cookies page] (KVKK Art. 5) for details;',
      },
      { text: 'terms', href: '/en/legal/terms/', becomes: 'words', sentence: '[terms]' },
    ])
    // Once the page it points to is public, the link stays.
    expect(changedLinks('[c](/en/legal/cookies/)', () => false)).toEqual([])
  })
})

describe('docs/m2-links-review.md', () => {
  it('is up to date with the texts and src/lib/m2-links.ts', () => {
    expect(
      readFileSync(DOC_FILE, 'utf8'),
      'docs/m2-links-review.md is out of date: run pnpm m2:links',
    ).toBe(linksReview())
  })

  it('names every text, and the approvals it assumes are those of the switch', () => {
    const doc = linksReview()
    for (const page of Object.values(CONTENT_PAGES)) expect(doc).toContain(`## \`${page.path}\``)
    expect(FIRST_APPROVALS).toEqual(['about', 'contact', 'iletisim', 'privacy', 'kvkk', 'acikRiza'])
    // The form links of the contact page, which become an email at M2 (D41 (1)).
    const contact = doc.slice(doc.indexOf('## `/en/contact/`'), doc.indexOf('## `/tr/iletisim/`'))
    expect(contact).toContain('“report form” (`/en/report/`): **email** to hello@gliagora.com.')
  })
})
