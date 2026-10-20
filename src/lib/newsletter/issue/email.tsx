import { Body } from '@react-email/body'
import { Container } from '@react-email/container'
import { Head } from '@react-email/head'
import { Heading } from '@react-email/heading'
import { Hr } from '@react-email/hr'
import { Html } from '@react-email/html'
import { Link } from '@react-email/link'
import { Preview } from '@react-email/preview'
import { Section } from '@react-email/section'
import { Text } from '@react-email/text'
import type { CSSProperties, ReactNode } from 'react'

import { CONTACT_EMAIL } from '@/lib/site'

import { EMAIL_COLOURS } from './colours'
import type { IssueContent, IssueJob } from './content'
import type { IssueLinks } from './links'
import { type IssueText, dayText, deadlineText, jobFacts, jobPlace, paragraphsOf } from './words'

// The email of an issue of Glia Notes (M11, D53; PLAN §13, React Email §11.3): one column of at
// most 600px, the mail program's own fonts, the site's colours (light, and dark where the mail
// program supports `prefers-color-scheme`), text that reads the same without the styles, and no
// image, so opening it loads nothing from anywhere (no tracking pixel; any image added later needs
// alt text, which a test checks). Every text comes from the `gliaNotes` messages; every link from
// `issueLinks()`. The plain-text part is made from the same content (text.ts).

const L = EMAIL_COLOURS.light
const D = EMAIL_COLOURS.dark

const FONT =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, 'Noto Sans', sans-serif"

/**
 * The dark colours, for mail programs that read `prefers-color-scheme`, and for Outlook.com, which
 * darkens messages itself and marks what it changed: `[data-ogsc]` on elements whose text colour
 * it changed, `[data-ogsb]` on those whose background it changed.
 */
const DARK_RULES = {
  text: [
    `.gn-text{color:${D.text}!important}`,
    `.gn-muted{color:${D.muted}!important}`,
    `.gn-accent{color:${D.accent}!important}`,
    `.gn-link{color:${D.link}!important}`,
    `.gn-line{border-color:${D.line}!important}`,
  ],
  background: [
    `.gn-bg{background-color:${D.bg}!important}`,
    `.gn-surface{background-color:${D.surface}!important}`,
  ],
}
const DARK_CSS = [
  `@media (prefers-color-scheme:dark){${[...DARK_RULES.background, ...DARK_RULES.text].join('')}}`,
  ...DARK_RULES.text.map((rule) => `[data-ogsc] ${rule}`),
  ...DARK_RULES.background.map((rule) => `[data-ogsb] ${rule}`),
].join('')

const pad: CSSProperties = { padding: '0 24px' }
const text: CSSProperties = {
  fontSize: '16px',
  lineHeight: '24px',
  margin: '0 0 16px',
  color: L.text,
}
const small: CSSProperties = {
  fontSize: '13px',
  lineHeight: '20px',
  margin: '0 0 8px',
  color: L.muted,
}
const linkStyle: CSSProperties = { color: L.link, textDecoration: 'underline' }
const h2: CSSProperties = {
  fontSize: '20px',
  lineHeight: '28px',
  fontWeight: 700,
  margin: '0 0 8px',
  color: L.text,
}
const rule: CSSProperties = {
  border: 'none',
  borderTop: `1px solid ${L.line}`,
  margin: '24px 0',
}

function A({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="gn-link" style={linkStyle}>
      {children}
    </Link>
  )
}

function DeadlineRow({ job, t, links }: { job: IssueJob; t: IssueText; links: IssueLinks }) {
  const place = jobPlace(job)
  return (
    <Text className="gn-text" style={{ ...text, margin: '0 0 12px' }}>
      <strong>{deadlineText(job, t)}</strong>
      <br />
      <A href={links.job(job.path)}>{job.title}</A>
      {place && (
        <>
          <br />
          <span className="gn-muted" style={{ color: L.muted, fontSize: '14px' }}>
            {place}
          </span>
        </>
      )}
    </Text>
  )
}

function SelectedJob({ job, t, links }: { job: IssueJob; t: IssueText; links: IssueLinks }) {
  const place = jobPlace(job)
  return (
    <Section style={{ margin: '0 0 20px' }}>
      <Heading
        as="h3"
        className="gn-text"
        style={{ fontSize: '17px', lineHeight: '24px', margin: '0 0 4px', color: L.text }}
      >
        <A href={links.job(job.path)}>{job.title}</A>
      </Heading>
      {place && (
        <Text className="gn-muted" style={{ ...small, fontSize: '14px', margin: '0 0 4px' }}>
          {place}
        </Text>
      )}
      <Text className="gn-text" style={{ ...text, fontSize: '14px', margin: '0 0 4px' }}>
        {jobFacts(job, t)}
      </Text>
      {job.summary && (
        <Text className="gn-text" style={{ ...text, margin: '0 0 4px' }}>
          {job.summary}
        </Text>
      )}
      {job.originalUrl && (
        <Text className="gn-text" style={{ ...text, fontSize: '14px', margin: 0 }}>
          <A href={job.originalUrl}>{t('job.original')}</A>{' '}
          <span className="gn-muted" style={{ color: L.muted }}>
            {t('job.originalHint')}
          </span>
        </Text>
      )}
    </Section>
  )
}

export type IssueEmailProps = {
  content: IssueContent
  links: IssueLinks
  t: IssueText
  /** The month as people read it ("November 2026"). */
  month: string
  /** A line at the top of a test email. */
  testNote?: string
}

export function IssueEmail({ content, links, t, month, testNote }: IssueEmailProps) {
  const { deadlines, selected } = content
  return (
    <Html lang="en" dir="ltr">
      <Head>
        {/* Mail apps that honour it lay the 600px column out at the phone's width, not at 980px
            scaled down. */}
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="color-scheme" content="light dark" />
        <meta name="supported-color-schemes" content="light dark" />
        <title>{content.subject}</title>
        <style>{DARK_CSS}</style>
      </Head>
      {content.preheader && <Preview>{content.preheader}</Preview>}
      {/* Body copies its background to a cell of its own, which no class reaches: the section
          inside it carries the page's colour, light and dark. */}
      <Body className="gn-bg" style={{ backgroundColor: L.bg, margin: 0, padding: 0 }}>
        <Section className="gn-bg" style={{ backgroundColor: L.bg, padding: '24px 0' }}>
          <Container
            className="gn-surface"
            style={{
              maxWidth: '600px',
              width: '100%',
              backgroundColor: L.surface,
              padding: '24px 0',
              fontFamily: FONT,
            }}
          >
            {testNote && (
              <Section style={pad}>
                <Text className="gn-accent" style={{ ...text, color: L.accent, fontWeight: 700 }}>
                  {testNote}
                </Text>
              </Section>
            )}
            <Section style={pad}>
              <Text
                className="gn-accent"
                style={{ ...text, color: L.accent, fontWeight: 700, margin: '0 0 4px' }}
              >
                {t('name')}
              </Text>
              <Heading
                as="h1"
                className="gn-text"
                style={{ fontSize: '26px', lineHeight: '32px', margin: '0 0 4px', color: L.text }}
              >
                {t('issueTitle', { month })}
              </Heading>
              <Text className="gn-muted" style={{ ...small, fontSize: '14px', margin: '0 0 24px' }}>
                {t('subtitle')} · <A href={links.online}>{t('readOnline')}</A>
              </Text>
              {paragraphsOf(content.intro).map((paragraph) => (
                <Text key={paragraph} className="gn-text" style={text}>
                  {paragraph}
                </Text>
              ))}
            </Section>

            <Section style={pad}>
              <Hr className="gn-line" style={rule} />
              <Heading as="h2" className="gn-text" style={h2}>
                {t('deadlines.heading')}
              </Heading>
              <Text className="gn-muted" style={{ ...small, fontSize: '14px', margin: '0 0 16px' }}>
                {t('deadlines.intro', { from: dayText(deadlines.from), to: dayText(deadlines.to) })}
              </Text>
              {deadlines.jobs.length === 0 ? (
                <Text className="gn-text" style={text}>
                  {t('deadlines.none')}
                </Text>
              ) : (
                deadlines.jobs.map((job) => (
                  <DeadlineRow key={job.id} job={job} t={t} links={links} />
                ))
              )}
              {deadlines.more > 0 && (
                <Text className="gn-text" style={text}>
                  <A href={links.moreDeadlines}>{t('deadlines.more', { count: deadlines.more })}</A>
                </Text>
              )}
            </Section>

            <Section style={pad}>
              <Hr className="gn-line" style={rule} />
              <Heading as="h2" className="gn-text" style={h2}>
                {t('selected.heading')}
              </Heading>
              <Text className="gn-muted" style={{ ...small, fontSize: '14px', margin: '0 0 16px' }}>
                {selected.length > 0 ? t('selected.intro') : t('selected.none')}
              </Text>
              {selected.map((job) => (
                <SelectedJob key={job.id} job={job} t={t} links={links} />
              ))}
            </Section>

            <Section style={pad}>
              <Hr className="gn-line" style={rule} />
              <Heading as="h2" className="gn-text" style={h2}>
                {t('more.heading')}
              </Heading>
              <Text className="gn-text" style={{ ...text, margin: '0 0 4px' }}>
                <A href={links.jobs}>{t('more.jobs')}</A>
              </Text>
              <Text className="gn-text" style={{ ...text, margin: '0 0 4px' }}>
                <A href={links.map}>{t('more.map')}</A>
              </Text>
              <Text className="gn-text" style={text}>
                {t('more.suggest', { email: CONTACT_EMAIL })}
              </Text>
            </Section>

            <Section style={pad}>
              <Hr className="gn-line" style={rule} />
              <Text className="gn-muted" style={small}>
                {t('footer.why')}
              </Text>
              <Text className="gn-muted" style={small}>
                {t('footer.unsubscribeText')}{' '}
                <A href={links.unsubscribe}>{t('footer.unsubscribe')}</A>
              </Text>
              <Text className="gn-muted" style={small}>
                <A href={links.contact}>{t('footer.contact')}</A> ·{' '}
                <A href={links.privacy}>{t('footer.privacy')}</A> ·{' '}
                <A href={links.kvkk}>{t('footer.kvkk')}</A>
              </Text>
              <Text className="gn-muted" style={{ ...small, margin: 0 }}>
                {t('footer.sender', { email: CONTACT_EMAIL })}
              </Text>
            </Section>
          </Container>
        </Section>
      </Body>
    </Html>
  )
}
