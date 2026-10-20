// Where each interface string appears, for docs/tr-strings-review.md (pnpm tr:review, D40): the
// table a native speaker reviews the Turkish strings from (PLAN §12). Written for a reader who
// does not work on the code: the page or email, the place on it and the element.
//
// Each area lists keys of messages/{locale}.json, or prefixes of keys (`jobs.filters.regions`
// stands for every key under it); a key takes the description of its longest match. Rows follow
// the order below, then the order of the keys in messages/en.json. A new key needs a description
// here (a unit test checks this): find where it is used (`grep -rn "<key or its last part>" src`)
// and say where a visitor sees or hears it. `shown` says whether the Turkish text is on the
// Turkish site now; an entry can differ from its area's default.

export type Place = string | { where: string; shown: boolean }

export type Area = {
  title: string
  /** Whether the area's strings are on the Turkish site now, unless an entry says otherwise. */
  shown: boolean
  /** Why they are, or are not yet, on the Turkish site: shown in the file's list of areas. */
  note: string
  places: Record<string, Place>
}

/** The Turkish pages that exist now (src/app/(frontend)/tr/). */
export const TURKISH_PAGES = [
  '/tr/iletisim/',
  '/tr/legal/kvkk-aydinlatma-metni/',
  '/tr/legal/acik-riza-metni/',
]

/**
 * The Turkish strings that go public at M2 (D41, D47), shown first in the review file so that a
 * native speaker can review them before then. At M2 the coming-soon page, the newsletter signup,
 * About and the legal texts the operator has approved go public; of these, only the contact page
 * and the two Turkish legal texts are in Turkish, and they show the reduced header and footer,
 * which link to public pages only (no sections, menus or search). About, the newsletter and the
 * coming-soon page are English only at M2: in Turkish they appear only as links in that header and
 * footer. So the strings of the newsletter signup and its pages (D50) are not in this list: their
 * Turkish drafts appear on no Turkish page at M2 (the area "Glia Notes signup and pages"); the
 * coming-soon page's are English only (src/app/(frontend)/m2/en/). Keys or prefixes of
 * messages/{locale}.json (as in AREAS), each with where it appears at M2; every one must be on the
 * Turkish site now, but those marked `onlyAtM2`, which only the M2 state's reduced header and
 * footer show on a Turkish page.
 */
export type AtM2 = string | { where: string; onlyAtM2: true }

export const PUBLIC_AT_M2: Record<string, AtM2> = {
  'a11y.skipLink': 'Turkish pages - top left, visible only when reached with the Tab key',
  'brand.name': 'Turkish pages - header - the name after the logo',
  'brand.descriptor': 'Turkish pages - header - the word after the name, where there is room',
  'locale.button': 'Turkish pages - header, from 768px - the language button, for screen readers',
  'locale.short.tr': 'Turkish pages - header, from 768px - the code on the language button',
  'locale.heading': 'Turkish pages - mobile menu, below 768px - heading of the language list',
  'locale.names':
    'Turkish pages - language menu and list - the languages, each in its own language',
  'locale.moreComing': 'Turkish pages - language menu and list - note under the languages',
  'header.digest':
    'Turkish pages - header (from 768px) and mobile menu - button to the newsletter signup, while the signup is public (with the açık rıza metni)',
  'header.menu': 'Turkish pages - header on phones - Menu button (language list, newsletter)',
  'sections.about': 'Turkish pages - footer (About column) and mobile menu - link to About',
  'pages.sources.title': 'Turkish pages - footer, About column - link, once the text is approved',
  'footer.sitemap': 'Turkish pages - footer - name of the footer navigation, for screen readers',
  'footer.about': 'Turkish pages - footer - heading of the About column',
  'footer.contact': 'Turkish pages - footer - link to the contact and legal notice page',
  'home.writeToUs': {
    where:
      'Turkish pages - footer - the last line, with the address, in place of the contact link while the Turkish contact page (/tr/iletisim/) is a draft',
    onlyAtM2: true,
  },
  'footer.legal': 'Turkish pages - footer - heading of the Legal column',
  'pages.privacy.title': 'Turkish pages - footer, Legal column - link, once the text is approved',
  'pages.kvkk.title':
    'Turkish pages - footer, Legal column - link; heading of the KVKK notice (once approved)',
  'pages.acikRiza.title':
    'Turkish pages - footer, Legal column - link; heading of the consent text (once approved)',
  'pages.cookies.title': 'Turkish pages - footer, Legal column - link, once the text is approved',
  'pages.terms.title': 'Turkish pages - footer, Legal column - link, once the text is approved',
  'pages.takedown.title': 'Turkish pages - footer, Legal column - link, once the text is approved',
  'pages.dataRequests.title':
    'Turkish pages - footer, Legal column - link, once the text is approved',
  'pages.accessibility.title':
    'Turkish pages - footer, Legal column - link, once the text is approved',
  'pages.contact': 'Turkish contact page (/tr/iletisim/) - heading, tab title and description',
  'pages.kvkk.description': 'KVKK notice - description in search results and link previews',
  'pages.acikRiza.description': 'Consent text - description in search results and link previews',
  'pages.updated': 'Turkish contact page and legal texts - date at the end of the text',
  'meta.titleTemplate': "Turkish pages - browser tab - the page's title followed by the site name",
  'meta.siteName': 'Turkish pages - the site name in link previews',
}

const ENGLISH_ONLY = 'like the rest of the site until the Turkish locale gate (PLAN §3.4)'

export const AREAS: Area[] = [
  {
    title: 'Header, menus and search box',
    shown: true,
    note: `On every page, so also on the Turkish pages (${TURKISH_PAGES.join(', ')}). The code EN on the language button is shown only on English pages, which use the English text.`,
    places: {
      'a11y.skipLink':
        'Every page - top left, visible only when reached with the Tab key - link that skips to the main content',
      'brand.name':
        'Every page - header - the name after the logo, a link to the home page (the same in every language); also on the About page (/en/about/)',
      'brand.descriptor':
        'Every page - header - the word after the name and a vertical line, where there is room (the same in every language); also on the About page (/en/about/)',
      'header.navLabel':
        'Every page - header and mobile menu - name of the main navigation, read by screen readers',
      windows:
        "Every page - header, mobile menu and footer (first column) - name of a section, once it is built (Jobs until M8, D55); also the heading of its page while it is being built, the first link in the path above a job page's heading, and links on the not-found and search pages",
      'header.menuFor':
        'Every page - header, wide screens - the arrow button beside Jobs (from M8 also Events and Resources) that opens its menu (name read by screen readers)',
      'menus.jobs':
        'Every page - Jobs menu (the arrow beside Jobs in the header, or Jobs in the mobile menu) - links',
      'menus.events': {
        where:
          'Every page - Events menu (the arrow beside Events in the header, or Events in the mobile menu) - links; hidden until the Events window is built (M8, D55)',
        shown: false,
      },
      'menus.resources': {
        where:
          'Every page - Resources menu (the arrow beside Resources in the header, or Resources in the mobile menu) - links; hidden until the Resources window is built (D55)',
        shown: false,
      },
      'search.trigger':
        'Every page - header - the search button (magnifier), name read by screen readers; on screens narrower than 360px a Search row at the top of the mobile menu',
      'search.shortcutCtrl':
        'Every page - header, wide screens with a keyboard - shortcut shown on the search button (Windows and Linux)',
      'search.shortcutApple':
        'Every page - header, wide screens with a keyboard - shortcut shown on the search button (Apple devices)',
      'search.label':
        'Every page - search box (opened from the header) - label of the text field; also on the search page (/en/search/) and the not-found page',
      'search.submit':
        'Every page - search box - Search button; also on the search page (/en/search/) and the not-found page',
      'search.hintEnter': 'Every page - search box - first hint under the field',
      'search.hintSyntax':
        'Every page - search box - second hint under the field; also on the search page (/en/search/), before a search and when nothing is found',
      'search.close': 'Every page - search box - close button (X), name read by screen readers',
      'locale.button':
        'Every page - header, from 768px - the language button (globe and code), name read by screen readers',
      'locale.short.en': {
        where:
          'Every page - header, from 768px - language code on the language button; a Turkish page shows TR (locale.short.tr), so this Turkish text is not shown',
        shown: false,
      },
      'locale.short': 'Every page - header, from 768px - language code on the language button',
      'locale.names':
        'Every page - language menu (header) and language list (mobile menu, below 768px) - the languages, each named in its own language',
      'locale.moreComing':
        'Every page - language menu and language list - note under the languages',
      'locale.heading': 'Every page - mobile menu, below 768px - heading of the language list',
      'header.digest': 'Every page - header (from 768px) and mobile menu - newsletter button',
      'header.account':
        'Every page - header, from 1280px - the account button (a person icon), name read by screen readers; below 1280px a row with the icon in the mobile menu, after About',
      'header.menu':
        'Every page - header below 1280px - Menu button (the word shows from 640px; narrower, it is read by screen readers)',
      'sections.map':
        'Every page - header (from 1280px) and mobile menu - link after the sections, and in the footer (first column) and on the not-found page; also the heading of the map page (/en/map/)',
      'sections.learn': {
        where:
          'The heading of the Learn page (/en/learn/, being built); in the mobile menu and the footer once Learn is built (D55)',
        shown: false,
      },
      'sections.about':
        'Every page - header (from 1280px), mobile menu, footer (About column) and the not-found page - link to the About page (/en/about/)',
    },
  },
  {
    title: 'Footer',
    shown: true,
    note: 'On every page, so also on the Turkish pages. The social media links stay hidden on every page until the addresses of the profiles are known (D31).',
    places: {
      'footer.sitemap':
        'Every page - footer - name of the footer navigation, read by screen readers',
      'footer.windows':
        'Every page - footer - heading of the first column (the sections that are built, the map and the subfields)',
      'footer.learn': {
        where: 'Every page - footer - heading of the Learn column, once Learn is built (D55)',
        shown: false,
      },
      'footer.learnBasics': {
        where:
          'Every page - footer, Learn column - link to the Learn page (/en/learn/), once it is built (D55)',
        shown: false,
      },
      'sections.benchToBedside':
        'The heading of the Bench to Bedside page (/en/learn/bench-to-bedside/, being built); in the footer once it is built (D55)',
      'footer.about': 'Every page - footer - heading of the third column',
      'footer.contact':
        'Every page - footer, About column and bottom row - link to the contact and legal notice page',
      'footer.legal':
        'Every page - footer - heading of the fourth column (its links are the titles of the legal pages, below)',
      'footer.follow': {
        where:
          'Every page - footer, bottom row - name of the list of social media links, read by screen readers (hidden until the addresses are known)',
        shown: false,
      },
      'footer.social': {
        where:
          'Every page - footer, bottom row - social media links (hidden until the addresses are known)',
        shown: false,
      },
    },
  },
  {
    title: 'Browser tab titles and link previews',
    shown: true,
    note: 'The title pattern and the site name are used on the Turkish pages. The home page title and the general description are not: every Turkish page has a title and a description of its own, and the home page exists only in English.',
    places: {
      'meta.titleTemplate':
        "Every page - browser tab and search results - the page's title followed by the site name; also the title of the jobs feed",
      'meta.siteName':
        'Every page - the site name in link previews (when a page is shared), not visible on the page',
      'meta.homeTitle': {
        where: 'Home page (/en/) - browser tab and search results - title',
        shown: false,
      },
      'meta.description': {
        where:
          'Home page (/en/), and pages without a description of their own - description in search results and link previews',
        shown: false,
      },
    },
  },
  {
    title: 'Legal and contact pages',
    shown: true,
    note: 'The Turkish contact page and the two Turkish legal texts show their own titles and descriptions, and every Turkish page shows the titles of all legal pages in its footer. The descriptions of the English legal pages and of the About page are not yet shown: those pages exist only in English. The texts of the pages themselves are reviewed separately (see the top of this file).',
    places: {
      'pages.draftNotice':
        'Legal and contact pages - notice under the heading while the text is a draft (all of them for now)',
      'pages.updated': 'Legal, contact and About pages - date at the end of the text',
      'pages.contact.title':
        'Contact and legal notice (/en/contact/, /tr/iletisim/) - heading and browser tab',
      'pages.contact.description':
        'Contact and legal notice (/en/contact/, /tr/iletisim/) - description in search results and link previews',
      'pages.kvkk.title':
        'Every page - footer, Legal column - link; also the heading of the KVKK notice (/tr/legal/kvkk-aydinlatma-metni/)',
      'pages.kvkk.description':
        'KVKK notice (/tr/legal/kvkk-aydinlatma-metni/) - description in search results and link previews',
      'pages.acikRiza.title':
        'Every page - footer, Legal column - link; also the heading of the Glia Notes consent text (/tr/legal/acik-riza-metni/)',
      'pages.acikRiza.description':
        'Glia Notes consent text (/tr/legal/acik-riza-metni/) - description in search results and link previews',
      'pages.privacy.title':
        'Every page - footer, Legal column - link; also the heading of the privacy policy (/en/legal/privacy/)',
      'pages.privacy.description': {
        where:
          'Privacy policy (/en/legal/privacy/) - description in search results and link previews',
        shown: false,
      },
      'pages.cookies.title':
        'Every page - footer, Legal column - link; also the heading of the cookies page (/en/legal/cookies/)',
      'pages.cookies.description': {
        where:
          'Cookies and storage (/en/legal/cookies/) - description in search results and link previews',
        shown: false,
      },
      'pages.terms.title':
        'Every page - footer, Legal column - link; also the heading of the terms of use (/en/legal/terms/)',
      'pages.terms.description': {
        where: 'Terms of use (/en/legal/terms/) - description in search results and link previews',
        shown: false,
      },
      'pages.takedown.title':
        'Every page - footer, Legal column - link; also the heading of the notice and takedown page (/en/legal/takedown/)',
      'pages.takedown.description': {
        where:
          'Notice and takedown (/en/legal/takedown/) - description in search results and link previews',
        shown: false,
      },
      'pages.dataRequests.title':
        'Every page - footer, Legal column - link; also the heading of the data requests page (/en/legal/data-requests/)',
      'pages.dataRequests.description': {
        where:
          'Data requests (/en/legal/data-requests/) - description in search results and link previews',
        shown: false,
      },
      'pages.accessibility.title':
        'Every page - footer, Legal column - link; also the heading of the accessibility statement (/en/legal/accessibility/)',
      'pages.accessibility.description': {
        where:
          'Accessibility statement (/en/legal/accessibility/) - description in search results and link previews',
        shown: false,
      },
      'pages.sources.title':
        'Every page - footer, About column - link; also the heading of the sources and editorial policy (/en/about/sources/)',
      'pages.sources.description': {
        where:
          'Sources and editorial policy (/en/about/sources/) - description in search results and link previews',
        shown: false,
      },
      'pages.about.title': {
        where: 'About page (/en/about/) - heading and browser tab',
        shown: false,
      },
      'pages.about.description': {
        where: 'About page (/en/about/) - description in search results and link previews',
        shown: false,
      },
    },
  },
  {
    title: 'Home page',
    shown: false,
    note: 'The home page (M6) is in English only (/en/); there is no Turkish home page yet. At M2 the public /en/ is the coming-soon page instead (D41), in English only too, while the home page stays private until the launch.',
    places: {
      'brand.tagline': 'Home page (/en/) - main heading; also the heading of the coming-soon page',
      'home.comingSoon': 'Coming-soon page (/en/ at M2) - text under the heading',
      'home.writeToUs':
        "Coming-soon page (/en/ at M2) - the last line, with the email address; at M2 also the last line of the footer, in the contact page's place until that page is approved",
      'home.subline': 'Home page - text under the heading',
      'home.findPositions': 'Home page - main button under the heading',
      'home.exploreMap': 'Home page - link next to the main button',
      'home.windowsLabel':
        'Home page - name of the list of links around the brain picture (read by screen readers)',
      'home.figures.title': 'Home page - heading of the figures band (read by screen readers)',
      'home.figures.open': 'Home page - figures band: number of open positions',
      'home.figures.openNote': 'Home page - figures band: line under the open positions',
      'home.figures.deadlines': 'Home page - figures band: deadlines this month',
      'home.figures.deadlinesNote':
        'Home page - figures band: line under the deadlines (a pun on "action potential")',
      'home.figures.institutions': 'Home page - figures band: institutions with open positions',
      'home.figures.institutionsNote': 'Home page - figures band: line under the institutions',
      'home.figures.countries': 'Home page - figures band: countries with open positions',
      'home.figures.countriesNote': 'Home page - figures band: line under the countries',
      'home.latest.title': 'Home page - heading of the newest positions',
      'home.latest.all': 'Home page - link under the newest positions',
      'home.latest.empty': 'Home page - text when there are no positions yet',
      'home.deadlines.title': 'Home page - heading of the coming deadlines',
      'home.deadlines.all': 'Home page - link under the coming deadlines',
      'home.deadlines.empty': 'Home page - text when no deadline is coming up',
      'home.nextLab.title': 'Home page - heading of the map section',
      'home.nextLab.text': 'Home page - text of the map section',
      'home.nextLab.link': 'Home page - button to the map',
      'home.nextLab.countries': 'Home page - heading of the list of countries',
      'home.nextLab.noCountries': 'Home page - text when no country has open positions',
      'home.nextLab.country': 'Home page - a country with its number of positions',
      'home.nextLab.more': 'Home page - link under the list of countries',
      'home.windows.title': 'Home page - heading of the sections overview',
      'home.windows.jobsText': 'Home page - sections overview: description of the positions',
      'home.windows.jobsAll': 'Home page - sections overview: link to all positions',
      'home.windows.type': 'Home page - sections overview: a position type with its number',
      'home.digest.title': 'Home page - heading of the newsletter box at the bottom',
      'home.digest.text': 'Home page - text of the newsletter box',
      'home.digest.short':
        'Home page - newsletter line under the figures; also on the coming-soon page (/en/ at M2), above its newsletter button',
      'home.digest.button':
        'Home page - newsletter button and link; also the newsletter button of the coming-soon page (/en/ at M2)',
    },
  },
  {
    title: 'Pages being built',
    shown: false,
    note: 'These stand-in pages for the sections that are not built yet exist only in English (/en/events/, /en/funding/, /en/papers/, /en/news/, /en/resources/, /en/learn/, /en/learn/bench-to-bedside/).',
    places: {
      'placeholder.text': 'Pages being built - text under the heading',
      'placeholder.contact': 'Pages being built - contact line',
      'placeholder.home': 'Pages being built - link to the home page',
      'sections.newsletter':
        'Not used on any page at the moment (the newsletter page has its own title, newsletter.title)',
      'sections.suggest':
        'Not used on any page at the moment (the Suggest a listing page has its own title, suggest.title)',
    },
  },
  {
    title: 'Error pages',
    shown: false,
    note: 'Always in English. The not-found page answers every unknown address, also under /tr/; the removed page and the short answer while the database is unreachable are in English too.',
    places: {
      'notFound.title': 'Not-found page (any unknown address) - heading and browser tab',
      'notFound.text':
        'Not-found page - text under the heading, before the links to the six sections and the search box',
      'notFound.home': 'Not-found page - link to the home page at the end',
      'gone.title':
        'Removed page (a withdrawn job, a job 30 days after it closed, a removed page) - heading and browser tab',
      'gone.text': 'Removed page - text under the heading',
      'gone.home': 'Removed page - link to the home page at the end',
      'unavailable.text':
        'Plain-text answer while the database cannot be reached (job, institution and subfield pages, sitemaps, jobs feed)',
    },
  },
  {
    title: 'Jobs list',
    shown: false,
    note: `The jobs list exists only in English (/en/jobs/), ${ENGLISH_ONLY}.`,
    places: {
      'jobs.list.title': 'Jobs list (/en/jobs/) - main heading and browser tab',
      'jobs.list.titlePage': 'Jobs list, page 2 and later - browser tab',
      'jobs.list.description': 'Jobs list - description in search results and link previews',
      'jobs.list.open': 'Jobs list - number of open positions, beside the main heading',
      'jobs.list.matches':
        'Jobs list - heading above the results (how many match the filters), read out when the results change; also read out in the filter sheet',
      'jobs.filters.label': 'Jobs list - the filters, name read by screen readers',
      'jobs.filters.search':
        'Jobs list - search field above the filters - text in the empty field, and its name for screen readers',
      'jobs.filters.searchButton':
        'Jobs list - search button (magnifier) beside that field, name read by screen readers',
      'jobs.filters.open':
        'Jobs list, below 1280px - button that opens the filter sheet, with the number of filters set',
      'jobs.filters.title': 'Jobs list, below 1280px - filter sheet - heading',
      'jobs.filters.close':
        'Jobs list, below 1280px - filter sheet - close button (X), name read by screen readers',
      'jobs.filters.type': 'Jobs list - filters - first filter button (and its panel)',
      'jobs.filters.subfield': 'Jobs list - filters - second filter button (and its panel)',
      'jobs.filters.method': 'Jobs list - filters - third filter button (and its panel)',
      'jobs.filters.methodGroups': 'Jobs list - Method filter - group headings',
      'jobs.filters.otherMethods':
        'Jobs list - Method filter - heading of the methods without a group',
      'jobs.filters.model': 'Jobs list - filters - fourth filter button (and its panel)',
      'jobs.filters.country':
        'Jobs list - Country or region filter - heading of its list of countries',
      'jobs.filters.region': 'Jobs list - Country or region filter - heading of the regions',
      'jobs.filters.regions':
        'Jobs list - Country or region filter - the regions; also on the chips of active filters',
      'jobs.filters.searchInList':
        'Jobs list - Subfield, Method and Country or region filters - field that narrows the list of choices as you type',
      'jobs.filters.deadline': 'Jobs list - filters - sixth filter button (and its panel)',
      'jobs.filters.deadlineAny': 'Jobs list - Deadline filter - first choice',
      'jobs.filters.within':
        'Jobs list - Deadline filter - choices for 7, 14, 30 and 90 days; also on the chip of that filter',
      'jobs.filters.thisMonth':
        'Jobs list - Deadline filter - choice; also on the chip of that filter',
      'jobs.filters.between': 'Jobs list - Deadline filter - last choice, with two dates',
      'jobs.filters.from': 'Jobs list - Deadline filter - label of the first date',
      'jobs.filters.to': 'Jobs list - Deadline filter - label of the second date',
      'jobs.filters.rangeHint': 'Jobs list - Deadline filter - hint under the two dates',
      'jobs.filters.rangeError':
        'Jobs list - Deadline filter - error under the two dates when they make no range',
      'jobs.filters.place':
        'Jobs list - filters - fifth filter button (location: countries and regions)',
      'jobs.filters.stage':
        'Jobs list - filters - last filter button (career stages, and its panel)',
      'jobs.filters.button':
        'Jobs list - a filter button when values are chosen, with their number, e.g. "Subfield (2)"',
      'jobs.filters.apply':
        'Jobs list - each filter panel - Apply button; also beside "Sort by" when JavaScript is off',
      'jobs.filters.show': 'Jobs list, below 1280px - filter sheet - button at the bottom',
      'jobs.filters.clearAll':
        'Jobs list - filter sheet (bottom), and beside the active filters - link that clears them',
      'jobs.filters.sort': 'Jobs list - above the results - label of the order',
      'jobs.filters.sortDeadline': 'Jobs list - Sort by - first choice',
      'jobs.filters.sortNewest': 'Jobs list - Sort by - second choice',
      'jobs.filters.chips':
        'Jobs list - the active filters (chips) under the heading of the results, name read by screen readers',
      'jobs.filters.removeFilter':
        'Jobs list - each active filter (chip), name read by screen readers',
      'jobs.filters.chipRange': 'Jobs list - chip of a deadline between two dates',
      'jobs.filters.chipSearch': 'Jobs list - chip of the words searched for',
      'jobs.list.emptyText': 'Jobs list - text when no position matches',
      'jobs.list.removeLast':
        'Jobs list, no position matches - button that removes the last filter',
      'jobs.list.removeUnknown':
        'Jobs list, no position matches - button that removes filters that no longer exist',
      'jobs.list.clearAll': 'Jobs list, no position matches - button that clears all filters',
      'jobs.list.suggest': 'Jobs list, no position matches - button to Suggest a listing',
      'jobs.list.pastEnd': 'Jobs list - note on a page number past the end of the list',
      'jobs.list.firstPage': 'Jobs list - link after that note',
      'jobs.list.preferred.text':
        "Jobs list opened without filters by a member with preferred subfields - notice above the filter chips, naming the member's subfields",
      'jobs.list.preferred.all':
        'Jobs list, with the preferred subfields applied - first link in that notice, to all positions',
      'jobs.list.preferred.change':
        'Jobs list, with the preferred subfields applied - second link in that notice, to the account page',
      'pagination.label': 'Jobs list - page links under the results - name read by screen readers',
      'pagination.previous': 'Jobs list - page links - link to the previous page',
      'pagination.next': 'Jobs list - page links - link to the next page',
      'pagination.page': 'Jobs list - page links - each page number, as read by screen readers',
      'jobs.error.title': 'Jobs list, when the list cannot be loaded - heading',
      'jobs.error.text': 'Jobs list, when the list cannot be loaded - text',
      'jobs.error.retry': 'Jobs list, when the list cannot be loaded - button',
      'jobs.error.reference':
        'Jobs list, when the list cannot be loaded - reference that finds the error in our logs',
    },
  },
  {
    title: 'Positions in lists',
    shown: false,
    note: `Each position in a list (the jobs list, job pages, institution and subfield pages, search results) and the deadline on job pages. These pages exist only in English, ${ENGLISH_ONLY}.`,
    places: {
      'jobs.institution':
        'Lists of positions - each position - label of the institution, read by screen readers',
      'jobs.location':
        'Lists of positions - each position - label of the place, read by screen readers',
      'jobs.place': 'Lists of positions, job page and jobs feed - city and country of a position',
      'jobs.positionType':
        'Lists of positions - each position - label of the position type, read by screen readers',
      'jobs.deadline':
        'Lists of positions - each position - label of the deadline, read by screen readers',
      'jobs.closes': 'Lists of positions - each position - the deadline day',
      'jobs.daysLeft': 'Lists of positions and job page - days left before the deadline',
      'jobs.lastDay':
        'Lists of positions and job page - instead of the days left, when less than a day is left',
      'jobs.closed': 'Lists of positions and job page - when the deadline has passed',
      'jobs.closingSoon':
        'Lists of positions and job page - badge when the deadline is within 14 days',
      'jobs.rolling':
        'Lists of positions and job page - deadline of a position with a rolling deadline',
      'jobs.untilFilled':
        'Lists of positions and job page - deadline of a position open until filled',
      'jobs.topics':
        'Lists of positions - each position - its topics (up to three), name read by screen readers',
      'jobs.moreTopics': 'Lists of positions - each position - chip after the topics, e.g. "+2"',
      'jobs.moreTopicsLabel': 'Lists of positions - that chip, as read by screen readers',
      'jobs.viewOriginal': "Lists of positions and job page - button to the employer's posting",
      'jobs.opensEmployerSite':
        'Lists of positions and job page - added to that button for screen readers',
    },
  },
  {
    title: 'Job pages',
    shown: false,
    note: `Job pages exist only in English (/en/jobs/…/), ${ENGLISH_ONLY}.`,
    places: {
      'a11y.breadcrumb':
        'Job, institution and subfield pages - the path above the heading (breadcrumbs), name read by screen readers',
      'job.description':
        'Job page - description in search results and link previews, when the position has no summary',
      'job.closedTitle': 'Job page of a closed position - heading of the notice at the top',
      'job.closedText': 'Job page of a closed position - text of that notice',
      'job.facts': 'Job page - heading of the facts box, read by screen readers',
      'job.deadline': 'Job page - facts box - label',
      'job.deadlineZone':
        'Job page - facts box - under the deadline day: until when, with the time zone',
      'job.deadlineOffset': 'Job page - facts box - the same, when the time zone has no name',
      'job.positionType': 'Job page - facts box - label',
      'job.careerStages': 'Job page - facts box - label',
      'job.start': 'Job page - facts box - label',
      'job.originalLanguage': 'Job page - facts box - label',
      'job.location': 'Job page - facts box - label',
      'job.institution': {
        where:
          'Not used on any page at the moment (the job page names the institution without a label)',
        shown: false,
      },
      'job.posting':
        "Job page - heading of the box with the button to the employer's posting, read by screen readers",
      'job.verification':
        'Job page of a closed position - heading of that box, read by screen readers',
      'job.authoritative': 'Job page - under the button to the posting',
      'job.lastVerified': 'Job page - the day the listing was last checked',
      'job.reportProblem': 'Job page - link to the Report a problem form',
      'job.summary': 'Job page - heading of our summary',
      'job.topics': 'Job page - heading of the topics',
      'job.subfields': 'Job page - topics - label',
      'job.methods': 'Job page - topics - label',
      'job.modelSystems': 'Job page - topics - label',
      'job.moreAtInstitution': 'Job page - heading of other positions at the same institution',
      'job.allAtInstitution': 'Job page - link under those positions, when there are more',
      'job.similar': 'Job page - heading of similar positions',
      'job.noSimilar': 'Job page - text when there are no similar open positions',
    },
  },
  {
    title: 'Jobs feed',
    shown: false,
    note: 'The feed (/en/jobs/feed.xml), which feed readers show, is in English only.',
    places: {
      'jobs.feed.title':
        "Jobs feed - its title (with the site name); also the feed's name in the jobs list page",
      'jobs.feed.description': 'Jobs feed - its description',
      'jobs.feed.institution': 'Jobs feed - text of each position - the institution',
      'jobs.feed.location': 'Jobs feed - text of each position - the place',
      'jobs.feed.deadline': 'Jobs feed - text of each position - the deadline day',
      'jobs.feed.rolling': 'Jobs feed - text of a position with a rolling deadline',
      'jobs.feed.untilFilled': 'Jobs feed - text of a position open until filled',
    },
  },
  {
    title: 'Institution pages',
    shown: false,
    note: `Institution pages exist only in English (/en/institutions/…/), ${ENGLISH_ONLY}.`,
    places: {
      'institution.description':
        'Institution page - description in search results and link previews',
      'institution.home':
        'Institution page - path above the heading (breadcrumbs) - first link, to the home page',
      'institution.location':
        'Institution page - city and country under the name; also in the search results (institutions)',
      'institution.notActive':
        'Institution page - note on an institution that ROR lists as no longer active',
      'institution.website': "Institution page - link to the institution's website",
      'institution.rorRecord': 'Institution page - link to its record in ROR',
      'institution.otherNames': 'Institution page - its other names, under the links',
      'institution.positions': 'Institution page - heading of the open positions',
      'institution.allPositions':
        'Institution page - link under the positions, when there are more',
      'institution.noPositions': 'Institution page - text when it has no open positions',
      'institution.events': 'Institution page - heading of the upcoming events',
      'institution.noEvents':
        'Institution page - text under that heading (there are no events yet)',
      'institution.reportProblem':
        'Institution page - link to the Report a problem form, under the links and other names',
      'institution.source': 'Institution page - source line at the end',
    },
  },
  {
    title: 'Subfields',
    shown: false,
    note: `The subfield pages exist only in English (/en/subfields/), ${ENGLISH_ONLY}.`,
    places: {
      'subfields.title':
        'Subfields page (/en/subfields/) - heading and browser tab; also in the path above the heading of each subfield page, and a link in the header (from 1280px), the mobile menu, the footer (first column) and the not-found page (D55)',
      'subfields.description': 'Subfields page - description in search results and link previews',
      'subfields.home':
        'Subfields page and subfield pages - path above the heading (breadcrumbs) - first link, to the home page',
      'subfields.intro': 'Subfields page - text under the heading',
      'subfields.hubDescription':
        'Subfield page (/en/subfields/…/) - description in search results and link previews',
      'subfields.positions': 'Subfield page - heading of the open positions',
      'subfields.allPositions': 'Subfield page - link under the positions, when there are more',
      'subfields.inJobsList':
        'Subfield page - link under the positions, when all of them are shown, to the filtered jobs list',
      'subfields.noPositions': 'Subfield page - text when there are no open positions',
      'subfields.comingSoon': 'Subfield page - note under the positions',
      'subfields.others': 'Subfield page - heading of the list of the other subfields',
    },
  },
  {
    title: 'Search page',
    shown: false,
    note: `The search page exists only in English (/en/search/), ${ENGLISH_ONLY}. The search box of the header is in area 1.`,
    places: {
      'search.title': 'Search page (/en/search/) - heading and browser tab',
      'search.titleQuery': 'Search page, after a search - browser tab',
      'search.description': 'Search page - description in link previews',
      'search.results': 'Search page - number of results, under the search field',
      'search.emptyTitle': 'Search page, before a search - heading',
      'search.emptyText': 'Search page, before a search - text under that heading',
      'search.browse': 'Search page, before a search - heading of the links to the sections',
      'search.allSubfields': 'Search page, before a search - last of those links',
      'search.noResultsTips': 'Search page, when nothing is found - heading of the tips',
      'search.tipSpelling': 'Search page, when nothing is found - first tip',
      'search.tipFewer': 'Search page, when nothing is found - second tip',
      'search.browsePositions': 'Search page, when nothing is found - first button',
      'search.suggest': 'Search page, when nothing is found - second button',
      'search.positions': 'Search results - heading of the positions',
      'search.positionsCount': 'Search results - number beside that heading',
      'search.seeAll': 'Search results - link under the positions, to the jobs list',
      'search.institutions': 'Search results - heading of the institutions',
      'search.institutionsCount': 'Search results - number beside that heading',
      'search.openPositions': 'Search results - each institution - its open positions',
      'search.institutionsMore':
        'Search results - note under the institutions, when there are more than shown',
      'search.subfields': 'Search results - heading of the subfields',
      'search.subfieldsCount': 'Search results - number beside that heading',
      'search.subfieldsMore':
        'Search results - under the subfields when not all are shown, with a link to the list of subfields',
      'search.error.title': 'Search page, when the search fails - heading',
      'search.error.text': 'Search page, when the search fails - text',
      'search.error.reference':
        'Search page, when the search fails - reference that finds the error in our logs',
      'search.error.retry': 'Search page, when the search fails - button',
    },
  },
  {
    title: 'Map',
    shown: false,
    note: `The map exists only in English (/en/map/, and the jobs list's map view), ${ENGLISH_ONLY}.`,
    places: {
      'map.title': 'Map page (/en/map/) - heading and browser tab',
      'map.description': 'Map page - description in link previews',
      'map.intro': 'Map page - text under the heading',
      'map.filterLink': "Map page - link to the jobs list's map view, under the text",
      'map.region': 'Map - name of the map area, read by screen readers',
      'map.skip':
        'Map - link before the map that jumps past it to the list (shown when it has focus)',
      'map.loading': 'Map - message on the map while it loads',
      'map.failed': 'Map - message on the map when it could not load',
      'map.noWebgl': 'Map - message in place of the map when the browser cannot draw it',
      'map.noJs': 'Map - message under the list when JavaScript is off',
      'map.listAll': 'Map page - heading of the list of institutions before the map has loaded',
      'map.listFailed': 'Map page - text in place of that list when it could not be read',
      'map.listInView': 'Map - heading of the list of the institutions in view',
      'map.listCount': 'Map - number beside that heading ("12 of 40")',
      'map.listMore': 'Map - note under that list when more institutions are in view than it shows',
      'map.positions': 'Map page - each institution in the list - its open positions',
      'map.positionsOne': 'Map - each institution in the list - one open position',
      'map.positionsOther':
        'Map - each institution in the list - its open positions (more than one)',
      'map.unmapped':
        'Map - note under the list about positions at institutions without a location',
      'map.sources': 'Map page - credits under the map (map data, basemap, institutions)',
      'map.credits': "Map - credits in the map's corner",
      'map.controls.title': 'Map - name of the map, read by screen readers',
      'map.controls.zoomIn': "Map - the zoom-in button's name",
      'map.controls.zoomOut': "Map - the zoom-out button's name",
      'map.controls.credits': "Map - the name of the button that shows the map's credits",
      'map.controls.windowsHelp':
        'Map - hint shown when scrolling over the map on Windows or Linux',
      'map.controls.macHelp': 'Map - hint shown when scrolling over the map on a Mac',
      'map.controls.mobileHelp': 'Map - hint shown when moving the map with one finger',
      'map.panel.close': "Map - an institution's panel - the close button",
      'map.panel.website': "Map - an institution's panel - link to its website",
      'map.panel.ror': "Map - an institution's panel - link to its ROR record",
      'map.panel.openPositions': "Map - an institution's panel - heading of its open positions",
      'map.panel.institutionPage': "Map - an institution's panel - link to the institution page",
      'map.panel.inList': "Map - an institution's panel - link to the jobs list with its positions",
      'jobs.view.showMap': 'Jobs list - link above the results that shows the map beside them',
      'jobs.view.hideMap': "Jobs list's map view - link above the results that hides the map",
      'jobs.view.institutions':
        "Jobs list's map view - heading of the list of institutions under the map, before it has loaded",
      'jobs.view.noJs': "Jobs list's map view - message under the map when JavaScript is off",
    },
  },
  {
    title: 'Suggest a listing',
    shown: false,
    note: `The form exists only in English (/en/suggest/), ${ENGLISH_ONLY}.`,
    places: {
      'suggest.title': 'Suggest a listing (/en/suggest/) - heading and browser tab',
      'suggest.description': 'Suggest a listing - description in search results and link previews',
      'suggest.intro': 'Suggest a listing - first paragraph under the heading',
      'suggest.employers': 'Suggest a listing - second paragraph',
      'suggest.otherKinds': 'Suggest a listing - third paragraph',
      'suggest.noscript': 'Suggest a listing - note above the form when JavaScript is off',
      'suggest.unavailable':
        'Suggest a listing - shown instead of the form while the form is switched off',
      'suggest.url.label': 'Suggest a listing - form - label of the first field (the address)',
      'suggest.url.hint': 'Suggest a listing - form - hint under that label',
      'suggest.kind.legend': 'Suggest a listing - form - question above the choices',
      'suggest.kind': 'Suggest a listing - form - the choices of what is suggested',
      'suggest.note.label': 'Suggest a listing - form - label of the note field',
      'suggest.note.hint': 'Suggest a listing - form - hint under that label',
      'suggest.note.left': 'Suggest a listing - form - count under the note field',
      'suggest.note.over':
        'Suggest a listing - form - count under the note field, when the note is too long',
      'suggest.email.label': 'Suggest a listing - form - label of the email field',
      'suggest.email.hint': 'Suggest a listing - form - hint under that label',
      'suggest.consent.label': 'Suggest a listing - form - label of the tick box',
      'suggest.consent.hint': 'Suggest a listing - form - hint under the tick box',
      'suggest.honeypot':
        'Suggest a listing - form - label of a hidden field that only spam programs see',
      'suggest.spamNote': 'Suggest a listing - form - note above the send button',
      'suggest.submit': 'Suggest a listing - form - send button',
      'suggest.sending': 'Suggest a listing - form - the send button while the form is sent',
      'suggest.errors.title':
        'Suggest a listing, after sending with problems - heading of the list of problems at the top of the form',
      'suggest.errors.prefix':
        'Suggest a listing, after sending with problems - word before the message at each field, read by screen readers',
      'suggest.errors.urlMissing': 'Suggest a listing - error at the address field',
      'suggest.errors.urlInvalid': 'Suggest a listing - error at the address field',
      'suggest.errors.urlScheme': 'Suggest a listing - error at the address field',
      'suggest.errors.urlCredentials': 'Suggest a listing - error at the address field',
      'suggest.errors.urlTooLong': 'Suggest a listing - error at the address field',
      'suggest.errors.kindMissing': 'Suggest a listing - error at the choices',
      'suggest.errors.noteTooLong': 'Suggest a listing - error at the note field',
      'suggest.errors.emailInvalid': 'Suggest a listing - error at the email field',
      'suggest.errors.emailTooLong': 'Suggest a listing - error at the email field',
      'suggest.errors.emailMissing':
        'Suggest a listing - error at the email field, when the box is ticked without an address',
      'suggest.errors.consentMissing':
        'Suggest a listing - error at the tick box, when an address is given without it',
      'suggest.errors.needsJs':
        'Suggest a listing - error at the top of the form, when the spam check did not run',
      'suggest.errors.spamCheck':
        'Suggest a listing - error at the top of the form, when the spam check failed',
      'suggest.errors.rateLimited':
        'Suggest a listing - error at the top of the form, after too many suggestions in an hour',
      'suggest.errors.unavailable':
        'Suggest a listing - error at the top of the form, while the form is switched off',
      'suggest.errors.failed':
        'Suggest a listing - error at the top of the form, when the suggestion could not be saved',
      'suggest.sent.title': 'Suggestion sent (/en/suggest/sent/) - heading',
      'suggest.sent.metaTitle': 'Suggestion sent - browser tab',
      'suggest.sent.next': 'Suggestion sent - heading of the steps',
      'suggest.sent.check': 'Suggestion sent - first step',
      'suggest.sent.publish': 'Suggestion sent - second step',
      'suggest.sent.outcome': 'Suggestion sent - third step',
      'suggest.sent.changedMind': 'Suggestion sent - paragraph after the steps',
      'suggest.sent.another': 'Suggestion sent - first link at the end',
      'suggest.sent.jobs': 'Suggestion sent - second link at the end',
    },
  },
  {
    title: 'Report a problem',
    shown: false,
    note: `The form exists only in English (/en/report/), ${ENGLISH_ONLY}.`,
    places: {
      'report.title': 'Report a problem (/en/report/) - heading and browser tab',
      'report.description': 'Report a problem - description in link previews',
      'report.intro':
        'Report a problem - first paragraph under the heading (a general report, or one opened from a job page)',
      'report.introInstitution':
        'Report a problem, opened from an institution page - first paragraph under the heading',
      'report.takedown': 'Report a problem - second paragraph',
      'report.about':
        'Report a problem, opened from a job or institution page - box naming the page the report is about',
      'report.noscript': 'Report a problem - note above the form when JavaScript is off',
      'report.unavailable':
        'Report a problem - shown instead of the form while the form is switched off',
      'report.kind.legend': 'Report a problem - form - question above the choices',
      'report.kind.wrong-fact': 'Report a problem - form - first choice (its label and hint)',
      'report.kind.wrong-fact.hintInstitution':
        'Report a problem, opened from an institution page - form - hint under the first choice',
      'report.kind.closed':
        'Report a problem - form - second choice (its label and hint); not offered for an institution',
      'report.kind.broken-link':
        'Report a problem - form - third choice (its label and hint; the second for an institution)',
      'report.kind.broken-link.hintInstitution':
        'Report a problem, opened from an institution page - form - hint under the second choice',
      'report.kind.not-employer':
        'Report a problem - form - fourth choice (its label and hint); not offered for an institution',
      'report.kind.personal-rights':
        'Report a problem - form - fifth choice (its label and hint; the third for an institution)',
      'report.kind.other': 'Report a problem - form - last choice (its label and hint)',
      'report.details.label': 'Report a problem - form - label of the details field',
      'report.details.hint': 'Report a problem - form - hint under that label',
      'report.details.left': 'Report a problem - form - count under the details field',
      'report.details.over':
        'Report a problem - form - count under the details field, when the text is too long',
      'report.email.label': 'Report a problem - form - label of the email field',
      'report.email.hint': 'Report a problem - form - hint under that label',
      'report.honeypot':
        'Report a problem - form - label of a hidden field that only spam programs see',
      'report.spamNote': 'Report a problem - form - note above the send button',
      'report.submit': 'Report a problem - form - send button',
      'report.sending': 'Report a problem - form - the send button while the form is sent',
      'report.errors.title':
        'Report a problem, after sending with problems - heading of the list of problems at the top of the form',
      'report.errors.prefix':
        'Report a problem, after sending with problems - word before the message at each field, read by screen readers',
      'report.errors.kindMissing': 'Report a problem - error at the choices',
      'report.errors.kindJobOnly':
        'Report a problem, opened from an institution page - error at the choices, when a choice for positions only was sent',
      'report.errors.detailsMissing': 'Report a problem - error at the details field',
      'report.errors.detailsTooLong': 'Report a problem - error at the details field',
      'report.errors.emailInvalid': 'Report a problem - error at the email field',
      'report.errors.emailTooLong': 'Report a problem - error at the email field',
      'report.errors.emailRequired':
        'Report a problem - error at the email field, for a request about personal rights without an address',
      'report.errors.needsJs':
        'Report a problem - error at the top of the form, when the spam check did not run',
      'report.errors.spamCheck':
        'Report a problem - error at the top of the form, when the spam check failed',
      'report.errors.rateLimited':
        'Report a problem - error at the top of the form, after too many reports in an hour',
      'report.errors.unavailable':
        'Report a problem - error at the top of the form, while the form is switched off',
      'report.errors.failed':
        'Report a problem - error at the top of the form, when the report could not be saved',
      'report.sent.title': 'Report sent (/en/report/sent/) - heading',
      'report.sent.metaTitle': 'Report sent - browser tab',
      'report.sent.next': 'Report sent - heading of what happens next',
      'report.sent.personalRightsTitle': 'Report sent - first subheading',
      'report.sent.personalRights': 'Report sent - text under the first subheading',
      'report.sent.otherTitle': 'Report sent - second subheading',
      'report.sent.other': 'Report sent - text under the second subheading',
      'report.sent.takedown': 'Report sent - paragraph after that text',
      'report.sent.another': 'Report sent - first link at the end',
      'report.sent.jobs': 'Report sent - second link at the end',
    },
  },
  {
    title: 'Data-request form and pages',
    shown: false,
    note: `The form at the end of the data requests page (/en/legal/data-requests/), and the pages after it, exist only in English, ${ENGLISH_ONLY}. They are not among the strings that go public at M2 in Turkish: at M2 the form goes public in English. The form shows only once a mail server is set up (M2).`,
    places: {
      'dataRequest.heading':
        'Data requests page (/en/legal/data-requests/) - heading of the form at the end of the page',
      'dataRequest.intro': 'Data requests page - first paragraph above the form',
      'dataRequest.kept':
        'Data requests page - second paragraph above the form (what is kept until the request is confirmed), with a link to the privacy policy',
      'dataRequest.unavailable':
        'Data requests page - instead of the form, while there is no mail server or the spam check is not set up',
      'dataRequest.noscript': 'Data requests page - note above the form when JavaScript is off',
      'dataRequest.email.label': 'Data request form - label of the email field',
      'dataRequest.email.hint': 'Data request form - hint under that label',
      'dataRequest.kind.legend': 'Data request form - question above the choices',
      'dataRequest.kind.deletion':
        'Data request form - first choice (its label and hint); the label also appears on the confirmation page',
      'dataRequest.kind.access':
        'Data request form - second choice (its label and hint); the label also appears on the confirmation page',
      'dataRequest.kind.correction':
        'Data request form - third choice (its label and hint); the label also appears on the confirmation page',
      'dataRequest.kind.objection':
        'Data request form - fourth choice (its label and hint); the label also appears on the confirmation page',
      'dataRequest.kind.restriction':
        'Data request form - fifth choice (its label and hint); the label also appears on the confirmation page',
      'dataRequest.kind.withdraw-consent':
        'Data request form - sixth choice (its label and hint); the label also appears on the confirmation page',
      'dataRequest.kind.other':
        'Data request form - last choice (its label and hint); the label also appears on the confirmation page',
      'dataRequest.name.label': 'Data request form - label of the name field',
      'dataRequest.name.hint': 'Data request form - hint under that label',
      'dataRequest.details.label': 'Data request form - label of the details field',
      'dataRequest.details.hint': 'Data request form - hint under that label',
      'dataRequest.details.left': 'Data request form - count under the details field',
      'dataRequest.details.over':
        'Data request form - count under the details field, when the text is too long',
      'dataRequest.honeypot':
        'Data request form - label of a hidden field that people never see (only spam programs fill it in)',
      'dataRequest.spamNote': 'Data request form - note above the send button',
      'dataRequest.submit': 'Data request form - send button',
      'dataRequest.sending': 'Data request form - the send button while the form is sent',
      'dataRequest.errors.title':
        'Data request form - heading of the box that lists the problems, after sending',
      'dataRequest.errors.prefix':
        'Data request form - word before each problem at its field, read by screen readers',
      'dataRequest.errors.emailMissing': 'Data request form - error at the email field',
      'dataRequest.errors.emailInvalid': 'Data request form - error at the email field',
      'dataRequest.errors.emailTooLong': 'Data request form - error at the email field',
      'dataRequest.errors.kindMissing': 'Data request form - error at the choices',
      'dataRequest.errors.nameTooLong': 'Data request form - error at the name field',
      'dataRequest.errors.detailsMissing': 'Data request form - error at the details field',
      'dataRequest.errors.detailsTooLong': 'Data request form - error at the details field',
      'dataRequest.errors.needsJs':
        'Data request form - error when the spam check did not run (JavaScript off, or the page had not loaded)',
      'dataRequest.errors.spamCheck':
        'Data request form - error when the spam check expired or failed',
      'dataRequest.errors.rateLimited':
        'Data request form - error after too many requests from one connection or to one address',
      'dataRequest.errors.unavailable':
        'Data request form - error when the confirmation email could not be sent',
      'dataRequest.errors.failed':
        'Data request form - error when the request could not be stored, with the reference that finds it in our log',
      'dataRequest.sent.metaTitle':
        'After sending the form (/en/legal/data-requests/sent/) - browser tab',
      'dataRequest.sent.title': 'After sending the form - heading',
      'dataRequest.sent.text': 'After sending the form - first paragraph',
      'dataRequest.sent.confirm': 'After sending the form - first point of the list',
      'dataRequest.sent.validity': 'After sending the form - second point of the list',
      'dataRequest.sent.notConfirmed': 'After sending the form - third point of the list',
      'dataRequest.sent.missing':
        'After sending the form - last paragraph, with a link back to the form',
      'dataRequest.confirm.expiredTitle':
        'Page the emailed link opens (/en/legal/data-requests/confirm/), when the link has expired or was used - heading and browser tab',
      'dataRequest.confirm.expired':
        'Page the emailed link opens, when the link has expired or was used - first paragraph',
      'dataRequest.confirm.expiredUsed':
        'Page the emailed link opens, when the link has expired or was used - second paragraph',
      'dataRequest.confirm.again':
        'Page the emailed link opens, when the link has expired or was used - button back to the form',
      'dataRequest.confirm.deletionTitle':
        'Page the emailed link opens, for a deletion - heading and browser tab',
      'dataRequest.confirm.otherTitle':
        'Page the emailed link opens, for any other request - heading and browser tab',
      'dataRequest.confirm.from':
        'Page the emailed link opens - the address the request was sent with ({email})',
      'dataRequest.confirm.deletion.intro':
        'Page the emailed link opens, for a deletion - paragraph under the address',
      'dataRequest.confirm.deletion.goneHeading':
        'Page the emailed link opens, for a deletion - first subheading',
      'dataRequest.confirm.deletion.gone':
        'Page the emailed link opens, for a deletion - the list of what is deleted',
      'dataRequest.confirm.deletion.keptHeading':
        'Page the emailed link opens, for a deletion - second subheading',
      'dataRequest.confirm.deletion.kept':
        'Page the emailed link opens, for a deletion - the list of what stays',
      'dataRequest.confirm.deletion.email':
        'Page the emailed link opens, for a deletion - paragraph after the lists',
      'dataRequest.confirm.deletion.button':
        'Page the emailed link opens, for a deletion - the button that deletes',
      'dataRequest.confirm.other.kind':
        'Page the emailed link opens, for any other request - what was asked for ({kind}: the choice in the form)',
      'dataRequest.confirm.other.answer':
        'Page the emailed link opens, for any other request - paragraph under that',
      'dataRequest.confirm.other.button':
        'Page the emailed link opens, for any other request - the button that confirms',
      'dataRequest.confirm.notYou': 'Page the emailed link opens - paragraph above the button',
      'dataRequest.done.metaTitle':
        'After a confirmed deletion (/en/legal/data-requests/done/) - browser tab',
      'dataRequest.done.title': 'After a confirmed deletion - heading',
      'dataRequest.done.text': 'After a confirmed deletion - paragraph above the list',
      'dataRequest.done.deleted': 'After a confirmed deletion - the list of what was deleted',
      'dataRequest.done.email': 'After a confirmed deletion - paragraph after that list',
      'dataRequest.done.keptHeading': 'After a confirmed deletion - subheading',
      'dataRequest.done.kept': 'After a confirmed deletion - the list of what stays',
      'dataRequest.done.more':
        'After a confirmed deletion - paragraph with a link to the data requests page',
      'dataRequest.done.jobs': 'After a confirmed deletion - first link at the end',
      'dataRequest.done.home': 'After a confirmed deletion - second link at the end',
      'dataRequest.received.metaTitle':
        'After any other confirmed request (/en/legal/data-requests/received/) - browser tab',
      'dataRequest.received.title': 'After any other confirmed request - heading',
      'dataRequest.received.text': 'After any other confirmed request - first paragraph',
      'dataRequest.received.answer': 'After any other confirmed request - second paragraph',
      'dataRequest.received.record': 'After any other confirmed request - third paragraph',
      'dataRequest.received.more':
        'After any other confirmed request - paragraph with a link to the data requests page',
      'dataRequest.received.jobs': 'After any other confirmed request - first link at the end',
      'dataRequest.received.home': 'After any other confirmed request - second link at the end',
      'outcome.error.requestFailed':
        'Page the emailed link opens - message at the top when confirming went wrong (nothing changed)',
      'outcome.error.requestFailedReference':
        'Page the emailed link opens - message at the top when confirming went wrong (nothing changed), with the reference that finds it in our log',
    },
  },
  {
    title: 'Glia Notes signup and pages',
    shown: false,
    note: `The newsletter signup (/en/newsletter/) and the pages after it exist only in English, ${ENGLISH_ONLY}. At M2 they go public in English, so they are not among the strings that go public at M2 in Turkish. The form shows only once listmonk and a mail server are set up (M2).`,
    places: {
      'newsletter.title': 'Newsletter signup (/en/newsletter/) - heading and browser tab',
      'newsletter.description':
        'Newsletter signup - description in search results and link previews',
      'newsletter.intro': 'Newsletter signup - first paragraph, under the heading',
      'newsletter.firstIssue': 'Newsletter signup - second paragraph',
      'newsletter.unavailable':
        'Newsletter signup - text in place of the form while the signup is off (not open yet: no mail server or newsletter system)',
      'newsletter.noscript': 'Newsletter signup - note above the form when JavaScript is off',
      'newsletter.email.label': 'Newsletter signup form - label of the email field',
      'newsletter.email.hint': 'Newsletter signup form - hint under that label',
      'newsletter.consent.label':
        'Newsletter signup form - label of the consent box (the same words as on the account page)',
      'newsletter.consent.hint':
        'Newsletter signup form - hint under the consent box, with links to the consent text, the privacy policy and the KVKK notice',
      'newsletter.honeypot':
        'Newsletter signup form - label of a hidden field for spam programs, read by no one else',
      'newsletter.spamNote': 'Newsletter signup form - note above the send button',
      'newsletter.submit': 'Newsletter signup form - send button',
      'newsletter.sending': 'Newsletter signup form - the send button while the form is sent',
      'newsletter.errors.title':
        'Newsletter signup form - heading of the box that lists the problems after sending',
      'newsletter.errors.prefix':
        'Newsletter signup form - word before each error at a field, read by screen readers',
      'newsletter.errors.emailMissing': 'Newsletter signup form - error at the email field',
      'newsletter.errors.emailInvalid': 'Newsletter signup form - error at the email field',
      'newsletter.errors.emailTooLong': 'Newsletter signup form - error at the email field',
      'newsletter.errors.consentMissing':
        'Newsletter signup form - error at the consent box when it was not ticked',
      'newsletter.errors.needsJs':
        'Newsletter signup form - error when the spam check could not run (JavaScript off)',
      'newsletter.errors.spamCheck': 'Newsletter signup form - error when the spam check failed',
      'newsletter.errors.rateLimited':
        'Newsletter signup form - error after too many signups from one connection or emails to one address',
      'newsletter.errors.wait':
        'Newsletter signup form - error when the same address was sent a link less than a minute ago',
      'newsletter.errors.unavailable':
        'Newsletter signup form - error when the confirmation email could not be sent',
      'newsletter.errors.failed':
        'Newsletter signup form - error when the signup could not be stored, with the reference that finds it in our log',
      'newsletter.inbox.title':
        'After sending the form (/en/newsletter/check-your-inbox/) - heading and browser tab',
      'newsletter.inbox.sent':
        'After sending the form - first paragraph: the address, shortened ({email}, such as r•••@example.org), and the days the link works ({days})',
      'newsletter.inbox.confirm': 'After sending the form - second paragraph',
      'newsletter.inbox.missing': 'After sending the form - paragraph above the button',
      'newsletter.inbox.again': 'After sending the form - button that sends the link again',
      'newsletter.inbox.wrongAddress':
        'After sending the form - last paragraph, with a link back to the form',
      'newsletter.inbox.general':
        'The same page, opened later or in another browser (without the address) - first paragraph ({days}: the days the link works)',
      'newsletter.inbox.generalMissing':
        'The same page, opened later or in another browser - last paragraph, with a link back to the form',
      'newsletter.confirm.title':
        'Page the emailed link opens (/en/newsletter/confirm/) - heading and browser tab',
      'newsletter.confirm.address':
        'Page the emailed link opens - the address to subscribe ({email})',
      'newsletter.confirm.what': 'Page the emailed link opens - paragraph under the address',
      'newsletter.confirm.notYou': 'Page the emailed link opens - paragraph above the button',
      'newsletter.confirm.button': 'Page the emailed link opens - the button that confirms',
      'newsletter.confirm.expiredTitle':
        'Page the emailed link opens, when the link has expired or was used - heading and browser tab',
      'newsletter.confirm.expired':
        'Page the emailed link opens, when the link has expired or was used - first paragraph ({days}: the days a link works)',
      'newsletter.confirm.expiredUsed':
        'Page the emailed link opens, when the link has expired or was used - second paragraph',
      'newsletter.confirm.again':
        'Page the emailed link opens, when the link has expired or was used - button back to the form',
      'newsletter.confirmed.title':
        'After confirming (/en/newsletter/confirmed/) - heading and browser tab',
      'newsletter.confirmed.text': 'After confirming - first paragraph',
      'newsletter.confirmed.welcome': 'After confirming - second paragraph',
      'newsletter.confirmed.home': 'After confirming - first button, to the home page',
      'newsletter.confirmed.about': 'After confirming - second button, to the About page',
      'newsletter.unsubscribe.title':
        'Page the unsubscribe link in every newsletter email opens (/en/newsletter/unsubscribe/) - heading and browser tab',
      'newsletter.unsubscribe.incomplete':
        'Unsubscribe page, when its link lacks the subscriber or was cut short - shown instead of the text and the button',
      'newsletter.unsubscribe.text': 'Unsubscribe page - first paragraph',
      'newsletter.unsubscribe.kept': 'Unsubscribe page - second paragraph',
      'newsletter.unsubscribe.button': 'Unsubscribe page - the button that unsubscribes',
      'newsletter.unsubscribed.title':
        'After unsubscribing (/en/newsletter/unsubscribed/) - heading and browser tab',
      'newsletter.unsubscribed.text': 'After unsubscribing - first paragraph',
      'newsletter.unsubscribed.kept': 'After unsubscribing - second paragraph',
      'newsletter.unsubscribed.again':
        'After unsubscribing - third paragraph, with a link to the signup form',
      'newsletter.unsubscribed.home': 'After unsubscribing - link to the home page',
      'outcome.done.resent':
        'After sending the form - message at the top after the link was sent again',
      'outcome.error.wait':
        'After sending the form - message at the top when the link was asked for again within a minute',
      'outcome.error.limited':
        'After sending the form - message at the top after too many links from one connection or to one address',
      'outcome.error.unavailable':
        'After sending the form, the page the emailed link opens and the unsubscribe page - message at the top while this is not possible (no mail server or newsletter system)',
      'outcome.error.resendFailed':
        'After sending the form - message at the top when sending the link again went wrong',
      'outcome.error.resendFailedReference':
        'After sending the form - message at the top when sending the link again went wrong, with the reference that finds it in our log',
      'outcome.error.subscribeFailed':
        'Page the emailed link opens - message at the top when confirming went wrong (nothing changed)',
      'outcome.error.subscribeFailedReference':
        'Page the emailed link opens - message at the top when confirming went wrong (nothing changed), with the reference that finds it in our log',
      'outcome.error.unsubscribeFailed':
        'Unsubscribe page - message at the top when unsubscribing went wrong (nothing changed)',
      'outcome.error.unsubscribeFailedReference':
        'Unsubscribe page - message at the top when unsubscribing went wrong (nothing changed), with the reference that finds it in our log',
    },
  },
  {
    title: 'Glia Notes issues and their archive',
    shown: false,
    note: 'The issues of Glia Notes and their archive pages (M11) are English only, like the windows; the archive is private until the launch. The Turkish texts are drafts for a Turkish issue later.',
    places: {
      'newsletter.archive.title': 'Glia Notes archive page - title and heading',
      'newsletter.archive.description':
        'Glia Notes archive page - description for search engines and link previews',
      'newsletter.archive.intro': 'Glia Notes archive page - paragraph under the heading',
      'newsletter.archive.empty':
        'Glia Notes archive page - paragraph instead of the list while no issue has been sent',
      'newsletter.archive.sentOn':
        'Glia Notes archive page and an issue’s page - the day it was sent ({date}, such as 3 Kas 2026)',
      'newsletter.archive.issueDescription':
        'An issue’s archive page - description for search engines and link previews ({month}, such as Kasım 2026)',
      'newsletter.archive.all': 'An issue’s archive page - link back to the list of issues',
      'newsletter.archive.subscribe': 'Glia Notes archive pages - link to the signup page',
      'gliaNotes.name':
        'Every issue (email and archive page) - the newsletter’s name above the title',
      'gliaNotes.subtitle': 'Every issue - line under the title',
      'gliaNotes.issueTitle': 'Every issue - title ({month}, such as Kasım 2026)',
      'gliaNotes.readOnline': 'Every issue’s email - link to the issue’s archive page',
      'gliaNotes.deadlines.heading': 'Every issue - heading of the deadlines section',
      'gliaNotes.deadlines.intro':
        'Every issue - line under that heading ({from} and {to}: the first and last day)',
      'gliaNotes.deadlines.more':
        'Every issue - link to the jobs list when more deadlines fall in the 45 days than the issue lists ({count}: how many more)',
      'gliaNotes.deadlines.none': 'Every issue - line instead of the deadlines when there are none',
      'gliaNotes.selected.heading': 'Every issue - heading of the selected positions',
      'gliaNotes.selected.intro': 'Every issue - line under that heading',
      'gliaNotes.selected.none':
        'Every issue - line instead of the selected positions when there are none',
      'gliaNotes.job.deadline': 'Every issue - a position’s deadline ({day}, such as 20 Kas 2026)',
      'gliaNotes.job.deadlineZone':
        'Every issue - a position’s deadline with the time zone its day ends in ({zone}, such as Orta Avrupa Saati (UTC+1))',
      'gliaNotes.job.deadlineAoe':
        'Every issue - a position’s deadline when the posting names no time zone',
      'gliaNotes.job.rolling':
        'Every issue - a position without a fixed deadline: applications read as they arrive',
      'gliaNotes.job.untilFilled': 'Every issue - a position open until it is filled',
      'gliaNotes.job.original': 'Every issue - link to the posting on the employer’s website',
      'gliaNotes.job.originalHint': 'Every issue - words after that link',
      'gliaNotes.more.heading': 'Every issue - heading of the last section, before the footer',
      'gliaNotes.more.jobs': 'Every issue - link to the jobs list',
      'gliaNotes.more.map': 'Every issue - link to the map',
      'gliaNotes.more.suggest':
        'Every issue - line asking for positions we missed ({email}: hello@gliagora.com)',
      'gliaNotes.footer.why': 'Every issue’s email - footer: why the reader gets it',
      'gliaNotes.footer.unsubscribe': 'Every issue’s email - footer: the unsubscribe link',
      'gliaNotes.footer.unsubscribeText':
        'Every issue’s email - footer: line before the unsubscribe link',
      'gliaNotes.footer.contact':
        'Every issue’s email - footer: link to the contact and legal notice',
      'gliaNotes.footer.privacy': 'Every issue’s email - footer: link to the privacy policy',
      'gliaNotes.footer.kvkk': 'Every issue’s email - footer: link to the KVKK notice',
      'gliaNotes.footer.sender':
        'Every issue’s email - footer: the sender’s name and address ({email})',
      'gliaNotes.test.subject':
        'A test email of an issue, sent to the editor - subject ({subject}: the issue’s own)',
      'gliaNotes.test.note': 'A test email of an issue - line at the top',
    },
  },
  {
    title: 'Sign-in and account pages',
    shown: false,
    note: `Sign-in, sign-out and the account pages exist only in English (/en/sign-in/, /en/account/), ${ENGLISH_ONLY}; Turkish pages link to them from the header and the mobile menu.`,
    places: {
      'signIn.title':
        'Sign in (/en/sign-in/) - heading and browser tab; the browser tab of the page an emailed sign-in link opens',
      'signIn.description': 'Sign in - description in link previews',
      'signIn.intro': 'Sign in - first paragraph under the heading',
      'signIn.save':
        'Sign in, opened from a Save button while signed out - line under the first paragraph, naming the position that signing in will save; also on the "Create your Gliagora account" page and the page an emailed sign-in link opens, when signing in will save a position',
      'signIn.notAvailable':
        'Sign in, and the account page when signed out - shown instead of the form while signing in is switched off',
      'signIn.notAvailableContact':
        'Sign in, and the account page when signed out - paragraph under that, while signing in is switched off',
      'signIn.providers.heading':
        'Sign in, and the account page when signed out - heading above the Google and ORCID buttons (it names the ways that are on: both, only Google or only ORCID)',
      'signIn.providers.google':
        'Sign in, and the account page when signed out - button that leads to Google to sign in',
      'signIn.providers.orcid':
        'Sign in, and the account page when signed out - button that leads to ORCID to sign in',
      'signIn.providers.note':
        'Sign in, and the account page when signed out - line under the Google and ORCID buttons (it names the ways that are on: both, only Google or only ORCID)',
      'signIn.emailHeading':
        'Sign in, and the account page when signed out - heading above the form',
      'signIn.email.label': 'Sign-in form - label of the email field',
      'signIn.email.hint': 'Sign-in form - hint under that label',
      'signIn.noscript': 'Sign-in form - note above the form when JavaScript is off',
      'signIn.honeypot': 'Sign-in form - label of a hidden field that only spam programs see',
      'signIn.spamNote': 'Sign-in form - note above the send button',
      'signIn.submit': 'Sign-in form - send button',
      'signIn.sending': 'Sign-in form - the send button while the form is sent',
      'signIn.privacy':
        'Sign in, and the account page when signed out - first line under the form (the link leads to the privacy policy)',
      'signIn.terms':
        'Sign in, and the account page when signed out - second line under the form (the link leads to the terms of use); its first sentence depends on whether Google or ORCID sign-in is on, or only the emailed link',
      'signIn.signedIn.title': 'Sign in, when already signed in - heading',
      'signIn.signedIn.account': 'Sign in, when already signed in - button to the account page',
      'signIn.signedIn.other': 'Sign in, when already signed in - paragraph above the buttons',
      'signIn.signedIn.save':
        "Sign in, when already signed in and opened from a Save button's link - line above that position's Save button",
      'signIn.errors.title':
        'Sign-in form, after sending with problems - heading of the list of problems at the top of the form',
      'signIn.errors.prefix':
        'Sign-in form, after sending with problems - word before the message at the field, read by screen readers',
      'signIn.errors.emailMissing': 'Sign-in form - error at the email field',
      'signIn.errors.emailInvalid': 'Sign-in form - error at the email field',
      'signIn.errors.emailTooLong': 'Sign-in form - error at the email field',
      'signIn.errors.needsJs':
        'Sign-in form - error at the top of the form, when the spam check did not run',
      'signIn.errors.spamCheck':
        'Sign-in form - error at the top of the form, when the spam check failed',
      'signIn.errors.rateLimited':
        'Sign-in form - error at the top of the form, after too many links asked for from one connection or for one email address (within an hour, or 5 for one email address within a day)',
      'signIn.errors.unavailable':
        'Sign-in form - error at the top of the form, when the email could not be sent or the form is switched off',
      'signIn.errors.failed':
        'Sign-in form - error at the top of the form, when something went wrong',
      'signIn.sent.metaTitle': 'Sign-in link sent (/en/sign-in/sent/) - browser tab',
      'signIn.sent.title': 'Sign-in link sent - heading',
      'signIn.sent.text': 'Sign-in link sent - first paragraph',
      'signIn.sent.validity': 'Sign-in link sent - first point of the list',
      'signIn.sent.sameBrowser': 'Sign-in link sent - second point of the list',
      'signIn.sent.missing': 'Sign-in link sent - paragraph after the list',
      'signIn.link.signInTitle':
        'The page an emailed sign-in link opens (/en/sign-in/link/), for an address with an account - heading',
      'signIn.link.signIn':
        'The page a sign-in link opens, for an address with an account - paragraph above the button',
      'signIn.link.signInButton':
        'The page a sign-in link opens, for an address with an account - button',
      'signIn.link.createTitle':
        'The page a sign-in link opens, for an address without an account - heading',
      'signIn.link.create':
        'The page a sign-in link opens, for an address without an account - paragraph above the button',
      'signIn.link.terms':
        'The page a sign-in link opens, for an address without an account - line about the terms of use and the minimum age',
      'signIn.link.createButton':
        'The page a sign-in link opens, for an address without an account - button',
      'signIn.link.otherBrowser':
        'The page a sign-in link opens, in a browser other than the one that asked for it - warning above the text',
      'signIn.link.expiredTitle':
        'The page a sign-in link opens, when the link has expired or was used - heading',
      'signIn.link.expired':
        'The page a sign-in link (or a link to add an address) opens, when the link has expired or was used - paragraph',
      'signIn.link.again':
        'The page a sign-in link opens, when the link has expired or was used - button to the sign-in page',
      'signIn.link.verifyTitle':
        'The page an emailed link to add an address opens (/en/sign-in/link/), for the member who asked for it - heading',
      'signIn.link.verify':
        'The page a link to add an address opens, for the member who asked for it - first paragraph, with the new address',
      'signIn.link.verifyReplaces':
        'The page a link to add an address opens, when the account already has an address - paragraph naming the address it replaces',
      'signIn.link.verifyOthers':
        'The page a link to add an address opens, for the member who asked for it - paragraph above the button',
      'signIn.link.verifyButton':
        'The page a link to add an address opens, for the member who asked for it - button',
      'signIn.link.verifyOtherTitle':
        'The page a link to add an address opens, for anyone else (signed out, or signed in to another account) - heading',
      'signIn.link.verifyOther':
        'The page a link to add an address opens, for anyone else - paragraph under the heading',
      'signIn.link.verifyOtherSignedIn':
        'The page a link to add an address opens, when signed in to another account - paragraph above the Sign out button',
      'signIn.link.signOut':
        'The page a link to add an address opens, when signed in to another account - Sign out button',
      'signIn.confirm.metaTitle':
        'Create your account (/en/sign-in/confirm/, after signing in with Google or ORCID for the first time) - browser tab',
      'signIn.confirm.title': 'Create your account - heading',
      'signIn.confirm.googleWithEmail':
        'Create your account, after Google with an address Google manages (Gmail or Google Workspace) - paragraph under the heading',
      'signIn.confirm.googleWithoutEmail':
        'Create your account, after Google with no address Google manages - paragraph under the heading',
      'signIn.confirm.googleNotManaged':
        'Create your account, after Google with an address Google does not manage (such as a university address) - note under the first paragraph',
      'signIn.confirm.googleUnverified':
        'Create your account, after Google with an address Google has not verified - note under the first paragraph',
      'signIn.confirm.orcid':
        'Create your account, after ORCID - paragraph under the heading, with the ORCID iD',
      'signIn.confirm.existing':
        'Create your account, when the new account would have no email address - hint for people who already have an account (the link leads to the sign-in page)',
      'signIn.confirm.useName':
        'Create your account, after ORCID - label of the checkbox (not ticked) that keeps the name on the ORCID record',
      'signIn.confirm.useNameHint': 'Create your account, after ORCID - hint under that checkbox',
      'signIn.confirm.terms':
        'Create your account - line about the terms of use and the minimum age, above the button',
      'signIn.confirm.button': 'Create your account - button that creates the account',
      'signIn.confirm.cancel': 'Create your account - button beside it, back to the sign-in page',
      'signIn.confirm.expiredTitle':
        'Create your account, when more than 15 minutes have passed or the page is opened in another browser - heading',
      'signIn.confirm.expired': 'Create your account, when it has expired - paragraph',
      'signIn.confirm.again':
        'Create your account, when it has expired - button to the sign-in page',
      'signIn.signedOut.metaTitle': 'Signed out (/en/sign-in/signed-out/) - browser tab',
      'signIn.signedOut.title': 'Signed out - heading',
      'signIn.signedOut.text': 'Signed out - paragraph',
      'signIn.signedOut.again': 'Signed out - first link',
      'signIn.signedOut.jobs': 'Signed out - second link',
      'account.title': 'Account (/en/account/) - heading and browser tab',
      'account.description': 'Account - description in link previews',
      'account.signedOutTitle': 'Account, when signed out - heading above the sign-in form',
      'account.navLabel':
        'Account pages - name of the account navigation at the top, read by screen readers',
      'account.nav.overview': 'Account pages - account navigation - link to the account page',
      'account.nav.saved':
        'Account pages - account navigation - link to the saved positions, when their number cannot be read',
      'account.nav.savedCount':
        'Account pages - account navigation - link to the saved positions, with how many there are',
      'account.nav.signOut':
        'Account pages - account navigation - Sign out button; also on the sign-in page when signed in',
      'account.who.email':
        'Account, and the sign-in page when signed in - who is signed in, for an account with an email address',
      'account.who.orcid':
        'Account, and the sign-in page when signed in - who is signed in, for an account with an ORCID iD and no email address',
      'account.who.google':
        'Account, and the sign-in page when signed in - who is signed in, for an account with only Google',
      'account.displayName':
        'Account - line under who is signed in, when the account has a display name (the name from the ORCID record, if the member chose it)',
      'account.noEmailNotice':
        'Account - notice under who is signed in, for an account without an email address: no warning before the deletion for inactivity (the link leads to the add-an-address form)',
      'account.noEmailNoticeLater':
        'Account - the same notice while adding an address is not available (no link)',
      'account.digest.heading': 'Account - heading of the Glia Notes section',
      'account.digest.text': 'Account - Glia Notes section - first paragraph',
      'account.digest.needsEmail':
        'Account - Glia Notes section, for an account without an email address - paragraph (the link leads to the email address section)',
      'account.digest.needsEmailLater':
        'Account - Glia Notes section, for an account without an email address, while the add-or-change form is not available (no mail server yet) - paragraph, without a link',
      'account.digest.on':
        'Account - Glia Notes section, when the member has chosen Glia Notes - paragraph with the address',
      'account.digest.stop':
        'Account - Glia Notes section, when the member has chosen Glia Notes - button that stops it',
      'account.digest.off':
        'Account - Glia Notes section, when Glia Notes is off - paragraph with the address it would go to',
      'account.digest.consent':
        'Account - Glia Notes section - label of the consent checkbox (never ticked in advance); the consent text quotes it',
      'account.digest.consentHint':
        'Account - Glia Notes section - hint under that checkbox (the link leads to the consent text)',
      'account.digest.start': 'Account - Glia Notes section - button that switches Glia Notes on',
      'account.subfields.heading': 'Account - heading of the preferred subfields section',
      'account.subfields.text':
        'Account - preferred subfields section - paragraph under the heading',
      'account.subfields.legend':
        'Account - preferred subfields section - name of the group of subfield checkboxes',
      'account.subfields.hint':
        'Account - preferred subfields section - hint above the checkboxes ({max} is 12)',
      'account.subfields.save': 'Account - preferred subfields section - save button',
      'account.email.heading': 'Account - heading of the email address section',
      'account.email.current':
        "Account - email address section - the account's address, when it has one",
      'account.email.none': 'Account - email address section - when the account has no address',
      'account.email.addHeading':
        'Account - email address section, for an account without an address - heading of the form',
      'account.email.changeHeading':
        'Account - email address section, for an account with an address - heading of the form',
      'account.email.label':
        'Account - add-an-address form - label of the email field, for an account without an address',
      'account.email.newLabel':
        'Account - add-an-address form - label of the email field, for an account with an address',
      'account.email.hint': 'Account - add-an-address form - hint under that label',
      'account.email.noscript':
        'Account - add-or-change form - note above the form when JavaScript is off (for an account with or without an address)',
      'account.email.spamNote':
        'Account - add-or-change form - note above the send button (the count of links is kept per account)',
      'account.email.submit': 'Account - add-an-address form - send button',
      'account.email.sending':
        'Account - add-an-address form - the send button while the form is sent',
      'account.email.unavailable':
        'Account - email address section - shown instead of the add-or-change form while emails cannot be sent',
      'account.email.errors.title':
        'Add-an-address form, after sending with problems - heading of the list of problems at the top of the form',
      'account.email.errors.prefix':
        'Add-an-address form, after sending with problems - word before the message at the field, read by screen readers',
      'account.email.errors.emailMissing':
        'Add-or-change form - error at the email field, when it is empty',
      'account.email.errors.emailInvalid': 'Add-an-address form - error at the email field',
      'account.email.errors.emailTooLong': 'Add-an-address form - error at the email field',
      'account.email.errors.emailSame':
        "Add-an-address form - error at the email field, when it is the account's own address",
      'account.email.errors.needsJs':
        'Add-an-address form - error at the top of the form, when the spam check did not run',
      'account.email.errors.spamCheck':
        'Add-an-address form - error at the top of the form, when the spam check failed',
      'account.email.errors.rateLimited':
        'Add-an-address form - error at the top of the form, after too many links asked for from one connection (10 an hour), by one account (3 an hour) or for one email address (3 an hour, 5 a day)',
      'account.email.errors.unavailable':
        'Add-an-address form - error at the top of the form, when the email could not be sent or the form is switched off',
      'account.email.errors.failed':
        'Add-an-address form - error at the top of the form, when something went wrong',
      'account.email.sent.metaTitle':
        'Confirmation link sent (/en/account/email/sent/) - browser tab',
      'account.email.sent.title': 'Confirmation link sent - heading',
      'account.email.sent.text': 'Confirmation link sent - first paragraph',
      'account.email.sent.validity': 'Confirmation link sent - first point of the list',
      'account.email.sent.sameBrowser': 'Confirmation link sent - second point of the list',
      'account.email.sent.missing':
        'Confirmation link sent - paragraph after the list (the link leads to the account page)',
      'account.methods.heading': 'Account - heading of the ways to sign in',
      'account.methods.email': 'Account - ways to sign in - the email link',
      'account.methods.google': 'Account - ways to sign in - Google',
      'account.methods.orcid': 'Account - ways to sign in - ORCID',
      'account.methods.noEmail':
        'Account - ways to sign in - beside the email link, for an account without an email address',
      'account.methods.linked': 'Account - ways to sign in - beside Google, when it is linked',
      'account.methods.notLinked':
        'Account - ways to sign in - beside Google or ORCID, when it is not linked',
      'account.methods.link.google':
        'Account - ways to sign in - button under Google, when it is not linked (it leads to Google)',
      'account.methods.link.orcid':
        'Account - ways to sign in - button under ORCID, when it is not linked (it leads to ORCID)',
      'account.methods.unlink.google':
        'Account - ways to sign in - button under Google, when it is linked',
      'account.methods.unlink.orcid':
        'Account - ways to sign in - button under ORCID, when it is linked',
      'account.methods.onlyWay':
        'Account - ways to sign in - under Google or ORCID instead of the remove button, when it is the only way into the account',
      'account.methods.note':
        'Account - ways to sign in - line under the list, while Google or ORCID sign-in is on (it names the ways that are on: both, only Google or only ORCID)',
      'account.name.heading': 'Account - heading of the display name section',
      'account.name.label': 'Account - display name section - label of the text field',
      'account.name.hint': 'Account - display name section - hint under that label ({max} is 80)',
      'account.name.save': 'Account - display name section - save button',
      'account.nav.privacy':
        'Account pages - account navigation - link to the privacy page (download your data, sign out everywhere, delete the account)',
      'account.privacy.title':
        'Privacy and your data (/en/account/privacy/) - heading and browser tab',
      'account.privacy.description': 'Privacy and your data - description in link previews',
      'account.privacy.signedOutTitle':
        'Privacy and your data, when signed out - heading above the sign-in form',
      'account.privacy.download.heading': 'Privacy and your data - heading of the download section',
      'account.privacy.download.text':
        'Privacy and your data - download section - what the file holds',
      'account.privacy.download.link':
        'Privacy and your data - download section - button that downloads the file',
      'account.privacy.download.format':
        'Privacy and your data - download section - note under the button about the file format',
      'account.privacy.signOut.heading':
        'Privacy and your data - heading of the section about signing out',
      'account.privacy.signOut.text':
        'Privacy and your data - paragraph about signing out everywhere',
      'account.privacy.signOut.everywhere': 'Privacy and your data - Sign out everywhere button',
      'account.privacy.delete.heading':
        'Privacy and your data - heading of the section about deleting the account',
      'account.privacy.delete.text': 'Privacy and your data - delete section - paragraph',
      'account.privacy.delete.link':
        'Privacy and your data - delete section - button that leads to the confirmation page',
      'account.privacy.more':
        'Privacy and your data - last paragraph, with links to the privacy policy and the data requests page',
      'account.delete.title':
        'Delete your account? (/en/account/privacy/delete/, the confirmation page) - heading and browser tab',
      'account.delete.description': 'Delete your account? - description in link previews',
      'account.delete.signedOutTitle':
        'Delete your account?, when signed out - heading above the sign-in form',
      'account.delete.intro': 'Delete your account? - paragraph under the heading',
      'account.delete.goneHeading': 'Delete your account? - heading of the list of what is deleted',
      'account.delete.gone': 'Delete your account? - list of what is deleted - items',
      'account.delete.keptHeading': 'Delete your account? - heading of the list of what stays',
      'account.delete.kept': 'Delete your account? - list of what stays - items',
      'account.delete.email':
        'Delete your account?, for an account with an email address when the site can send email - paragraph above the buttons',
      'account.delete.submit': 'Delete your account? - button that deletes the account',
      'account.delete.cancel': 'Delete your account? - button beside it, back to the privacy page',
      'account.deleted.metaTitle': 'Account deleted (/en/account/deleted/) - browser tab',
      'account.deleted.title': 'Account deleted - heading',
      'account.deleted.text': 'Account deleted - first paragraph',
      'account.deleted.kept': 'Account deleted - paragraph about what stays',
      'account.deleted.email':
        'Account deleted - paragraph about the confirmation email the account’s address may receive',
      'account.deleted.jobs': 'Account deleted - first link (the jobs list)',
      'account.deleted.home': 'Account deleted - second link (the home page)',
      'outcome.done.signed-in':
        'Account - message at the top after signing in, with an emailed link, Google or ORCID (also after "Create account" when the account already existed by then)',
      'outcome.done.signed-in-linked-google':
        'Account - message at the top after signing in with Google for the first time to an account that already had the same email address, which linked Google to it',
      'outcome.done.created':
        'Account - message at the top after creating an account, with an emailed link or with the "Create account" button after signing in with Google or ORCID for the first time',
      'outcome.done.linked-google': 'Account - message at the top after linking a Google account',
      'outcome.done.linked-orcid': 'Account - message at the top after linking an ORCID iD',
      'outcome.done.unlinked-google': 'Account - message at the top after removing Google',
      'outcome.done.unlinked-orcid': 'Account - message at the top after removing ORCID',
      'outcome.done.email-verified':
        'Account - message at the top after adding or changing the email address with its emailed link',
      'outcome.done.digest-on': 'Account - message at the top after switching Glia Notes on',
      'outcome.done.digest-off': 'Account - message at the top after stopping Glia Notes',
      'outcome.done.subfields-saved':
        'Account - message at the top after saving preferred subfields',
      'outcome.done.subfields-removed':
        'Account - message at the top after saving with no preferred subfield ticked',
      'outcome.done.name-saved': 'Account - message at the top after saving the display name',
      'outcome.done.name-removed':
        'Account - message at the top after saving an empty display name, which removes it',
      'outcome.done.not-signed-in':
        'Privacy and your data, when signed out - message above the sign-in form after pressing Delete my account while no longer signed in (for example a second press after the account was deleted)',
      'outcome.done.othersEnded':
        'Account - second sentence of the message at the top, after linking or removing a way to sign in, when the account was signed in in other browsers too',
      'outcome.error.link-expired':
        'Sign in - message at the top when an emailed link had expired or was used',
      'outcome.error.linkExpiredSignedIn':
        'Sign in, when already signed in - message at the top when an emailed link had expired or was used (the browser stays signed in to the same account)',
      'outcome.error.expired':
        'Sign in, or the account page - message at the top when signing in with or linking Google or ORCID took more than 15 minutes, came back to another browser or an older tab, or "Create account" was pressed after its 15 minutes',
      'outcome.error.cancelled-google':
        'Sign in, or the account page - message at the top when the person cancelled on the Google page (signing in or linking)',
      'outcome.error.cancelled-orcid':
        'Sign in, or the account page - message at the top when the person cancelled on the ORCID page (signing in or linking)',
      'outcome.error.link-interrupted':
        'Account - message at the top when linking Google or ORCID ended after the browser was signed out or signed in to another account',
      'outcome.error.link-not-started':
        'Account - message at the top when a Link button was pressed in a browser that does not say which site started the request (or the link was opened from outside the site)',
      'outcome.error.create-limited':
        'Sign in - message at the top when too many accounts were created from one connection within an hour',
      'outcome.error.email-has-other-google':
        'Sign in - message at the top when the Google address belongs to an account that has another Google account',
      'outcome.error.google-elsewhere':
        'Account - message at the top when the Google account to link belongs to another Gliagora account',
      'outcome.error.orcid-elsewhere':
        'Account - message at the top when the ORCID iD to link belongs to another Gliagora account',
      'outcome.error.google-already-linked':
        'Account - message at the top when the account already has another Google account',
      'outcome.error.orcid-already-linked':
        'Account - message at the top when the account already has another ORCID iD',
      'outcome.error.last-method':
        'Account - message at the top when removing the only way into the account was refused',
      'outcome.error.email-taken':
        'Account - message at the top when the address of a link to add an address belongs to another account',
      'outcome.error.verify-expired':
        'Account - message at the top when a link to add an address had expired or was used, or was asked for by another account',
      'outcome.error.digest-consent':
        'Account - message at the top when Get Glia Notes was pressed without ticking the consent box',
      'outcome.error.digest-needs-email':
        'Account - message at the top when Glia Notes was asked for by an account without an email address',
      'outcome.error.subfields-too-many':
        'Account - message at the top when more than 12 preferred subfields were ticked',
      'outcome.error.name-invalid':
        'Account - message at the top when the display name was too long or had control characters',
      'outcome.error.failed':
        'Sign-in and account pages - message at the top when something went wrong (on the privacy page: the download)',
      'outcome.error.failedReference':
        'Sign-in and account pages - message at the top when something went wrong, with the reference that finds it in our log',
      'outcome.error.deleteFailed':
        'Delete your account? - message at the top when deleting the account went wrong (nothing was deleted)',
      'outcome.error.deleteFailedReference':
        'Delete your account? - message at the top when deleting the account went wrong (nothing was deleted), with the reference that finds it in our log',
    },
  },
  {
    title: 'Save buttons and saved positions',
    shown: false,
    note: `The Save buttons are on the jobs list and the job pages, and the saved positions on /en/account/saved/, all only in English, ${ENGLISH_ONLY}. They show only once a way of signing in is switched on.`,
    places: {
      'save.label':
        "Jobs list (each position), job page (under the heading) and saved positions - the Save button; screen readers hear the position's title after it; also on the sign-in page (/en/sign-in/), when already signed in and opened from a Save button's link",
      'save.savedLabel':
        'Jobs list (each position), job page and saved positions - the Save button once the position is saved (it reads "Saved"); screen readers hear the position\'s title after it',
      'save.savedStatus':
        "Jobs list, job page and saved positions - read by screen readers after pressing Save, when the position has been saved; also on the sign-in page (/en/sign-in/), when already signed in and opened from a Save button's link",
      'save.removedStatus':
        "Jobs list, job page and saved positions - read by screen readers after pressing Save again, when the position has been removed; also on the sign-in page (/en/sign-in/), when already signed in and opened from a Save button's link",
      'save.signInNote':
        'Jobs list and job page, when signed out - read by screen readers with each Save button, which leads to the sign-in page',
      'saved.title': 'Saved positions (/en/account/saved/) - heading and browser tab',
      'saved.description': 'Saved positions - description in link previews',
      'saved.signedOutTitle': 'Saved positions, when signed out - heading above the sign-in form',
      'saved.intro': 'Saved positions - paragraph under the heading, with how many there are',
      'saved.empty':
        'Saved positions, when there are none - paragraph under the heading (the link leads to the jobs list)',
      'saved.open': 'Saved positions - heading of the positions that are still open',
      'saved.closed':
        'Saved positions - heading of the positions that have closed or were withdrawn',
      'saved.closedText': 'Saved positions - paragraph under that heading',
      'saved.pastEnd':
        'Saved positions, opened at a page number past the last page - line at the end of the page',
      'saved.firstPage': 'Saved positions, past the last page - link to the first page',
      'outcome.done.removed':
        'Saved positions - message at the top after removing a position with JavaScript turned off',
      'outcome.error.saved-full':
        'Saved positions - message at the top when a position could not be saved because 500 are saved already',
      'outcome.error.not-public':
        'Saved positions - message at the top when a position could not be saved because it closed more than 30 days ago or was withdrawn',
    },
  },
  {
    title: 'Automatic emails',
    shown: false,
    note: 'Each email goes out in the language of the form the person used, and those forms exist only in English, so every email is in English for now; the Turkish texts are used once Turkish forms exist. Emails are sent only once a mail server is set up (M2).',
    places: {
      'emails.greeting':
        'Every automatic email (the outcome of a suggestion, the confirmation of a report, a sign-in link, a link to add an address, the link to confirm a data request, the emails about deleting an account or data) - first line',
      'emails.suggestion.subjectPublished':
        'Email about the outcome of a suggestion, when it was published - subject',
      'emails.suggestion.subjectNotAdded':
        'Email about the outcome of a suggestion, when it was not added - subject',
      'emails.suggestion.intro':
        'Email about a suggestion - first paragraph, followed by the address the person suggested',
      'emails.suggestion.published':
        'Email about a published suggestion - second paragraph, followed by the address of the job page',
      'emails.suggestion.notAdded':
        'Email about a suggestion that was not added - second paragraph, followed by the reason',
      'emails.suggestion.reasons':
        'Email about a suggestion that was not added - the reason, as the editor chose it',
      'emails.suggestion.retention':
        'Email about a suggestion - last paragraph before the closing lines (the link leads to the privacy policy, and in the Turkish email to the KVKK notice)',
      'emails.report.subject': 'Confirmation of a report - subject',
      'emails.report.subjectPersonalRights':
        'Confirmation of a request about personal rights - subject',
      'emails.report.intro': 'Confirmation of a report - first paragraph',
      'emails.report.introPersonalRights':
        'Confirmation of a request about personal rights - first paragraph',
      'emails.report.item':
        'Both confirmations (report, request about personal rights) - second paragraph, followed by the address of the page the report is about (when there is one)',
      'emails.report.next':
        'Confirmation of a report about a job, or of a general report - what happens next',
      'emails.report.nextInstitution':
        'Confirmation of a report about an institution - what happens next',
      'emails.report.nextPersonalRights':
        'Confirmation of a request about personal rights - what happens next',
      'emails.report.retention':
        'Confirmation of a report - last paragraph before the closing lines (the link leads to the privacy policy, and in the Turkish email to the KVKK notice)',
      'emails.report.retentionPersonalRights':
        'Confirmation of a request about personal rights - last paragraph before the closing lines (the link leads to the privacy policy, and in the Turkish email to the KVKK notice)',
      'emails.signIn.subject': 'Email with a sign-in link - subject',
      'emails.signIn.intro': 'Email with a sign-in link - first paragraph, followed by the link',
      'emails.signIn.validity': 'Email with a sign-in link - how long the link works',
      'emails.signIn.sameBrowser': 'Email with a sign-in link - where to open the link',
      'emails.signIn.notYou': 'Email with a sign-in link - what to do if you did not ask for it',
      'emails.verifyEmail.subject':
        'Email with a link to add an address to an account - subject (a question: whoever reads it may have no account)',
      'emails.verifyEmail.intro':
        'Email with a link to add an address to an account - first paragraph, followed by the link',
      'emails.verifyEmail.validity':
        'Email with a link to add an address to an account - how long the link works',
      'emails.verifyEmail.notYou':
        'Email with a link to add an address to an account - what to do if you did not ask for it',
      'emails.newsletter.confirm.subject':
        'Email with the link to confirm a newsletter signup (sent when the signup form is sent, or again from "Check your inbox") - subject',
      'emails.newsletter.confirm.intro':
        'Email with the link to confirm a newsletter signup - first paragraph, followed by the link',
      'emails.newsletter.confirm.validity':
        'Email with the link to confirm a newsletter signup - how long the link works',
      'emails.newsletter.confirm.notYou':
        'Email with the link to confirm a newsletter signup - what to do if you did not ask for it, and what we keep',
      'emails.newsletter.welcome.subject':
        'Welcome email after a newsletter signup was confirmed - subject',
      'emails.newsletter.welcome.text': 'Welcome email - first paragraph',
      'emails.newsletter.welcome.launch':
        'Welcome email - second paragraph: the first issue comes with the public launch',
      'emails.newsletter.welcome.unsubscribe':
        'Welcome email - how to unsubscribe, followed by the link to the unsubscribe page',
      'emails.newsletter.welcome.kept':
        'Welcome email - what we keep (the link leads to the privacy policy, and in the Turkish email to the KVKK notice)',
      'emails.dataRequest.confirm.subject':
        'Email with the link to confirm a data request (sent when the data-request form is sent) - subject',
      'emails.dataRequest.confirm.types':
        'Email with the link to confirm a data request - first paragraph, which names the kind of request (one text for each choice of the form)',
      'emails.dataRequest.confirm.act':
        'Email with the link to confirm a data request - second paragraph, followed by the link',
      'emails.dataRequest.confirm.validity':
        'Email with the link to confirm a data request - how long the link works',
      'emails.dataRequest.confirm.notYou':
        'Email with the link to confirm a data request - what to do if you did not send it, and what we keep then',
      'emails.dataRequest.deleted.subject':
        'Email after a deletion confirmed with the data-request form - subject',
      'emails.dataRequest.deleted.text':
        'Email after a confirmed deletion - first paragraph, followed by the list of what was deleted',
      'emails.dataRequest.deleted.suggestions':
        'Email after a confirmed deletion - a point of the list: the suggestions deleted ({count}: their number)',
      'emails.dataRequest.deleted.account':
        'Email after a confirmed deletion - a point of the list: the account deleted',
      'emails.dataRequest.deleted.newsletter':
        'Email after a confirmed deletion - a point of the list: the Glia Notes subscription removed (from M2)',
      'emails.dataRequest.deleted.reports':
        'Email after a confirmed deletion - a point of the list: the reports whose address was removed ({count}: their number)',
      'emails.dataRequest.deleted.nothing':
        'Email after a confirmed deletion - first paragraph instead, when nothing was found under the address',
      'emails.dataRequest.deleted.kept':
        'Email after a confirmed deletion - the requests about personal rights that keep the address, and why ({count}: their number)',
      'emails.dataRequest.deleted.record':
        'Email after a confirmed deletion - what stays, with the link to the privacy notice',
      'emails.account.deleted.subject': 'Email after a member deleted their account - subject',
      'emails.account.deleted.text': 'Email after a member deleted their account - first paragraph',
      'emails.account.deleted.newsletter':
        'Email after a member deleted their account - paragraph when a Glia Notes subscription ended with it',
      'emails.account.deleted.kept':
        'Email after a member deleted their account - what stays, with the link to the privacy notice',
      'emails.account.inactiveWarning.subject':
        'Email to a member who has not used the account for 2 years - subject',
      'emails.account.inactiveWarning.text':
        'Email to a member who has not used the account for 2 years - first paragraph, with the date ({date}, such as 31 Eki 2026), followed by the link to the sign-in page',
      'emails.account.inactiveWarning.after':
        'Email to a member who has not used the account for 2 years - what happens if they do not sign in',
      'emails.account.inactiveWarning.why':
        'Email to a member who has not used the account for 2 years - why, with the link to the privacy notice',
      'emails.automatic': 'Every automatic email - line before the signature',
      'emails.signature': 'Every automatic email - signature',
    },
  },
]
