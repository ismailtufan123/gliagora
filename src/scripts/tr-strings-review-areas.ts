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
 * footer. The strings of the newsletter signup and of the coming-soon text are written at M2 and
 * join this list then, if they have Turkish versions. Keys or prefixes of messages/{locale}.json
 * (as in AREAS), each with where it appears at M2; every one must be on the Turkish site now.
 */
export const PUBLIC_AT_M2: Record<string, string> = {
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
    'Turkish pages - header (from 768px) and mobile menu - button to the newsletter signup',
  'header.menu': 'Turkish pages - header on phones - Menu button (language list, newsletter)',
  'sections.about': 'Turkish pages - footer (About column) and mobile menu - link to About',
  'footer.sitemap': 'Turkish pages - footer - name of the footer navigation, for screen readers',
  'footer.about': 'Turkish pages - footer - heading of the About column',
  'footer.contact': 'Turkish pages - footer - link to the contact and legal notice page',
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
        "Every page - header, mobile menu and footer (first column) - name of a section; also the heading of its page while it is being built, the first link in the path above a job page's heading, and links on the not-found and search pages",
      'header.menuFor':
        'Every page - header, wide screens - the arrow button beside Jobs, Events and Resources that opens their menu (name read by screen readers)',
      'menus.jobs':
        'Every page - Jobs menu (the arrow beside Jobs in the header, or Jobs in the mobile menu) - links',
      'menus.events':
        'Every page - Events menu (the arrow beside Events in the header, or Events in the mobile menu) - links',
      'menus.resources':
        'Every page - Resources menu (the arrow beside Resources in the header, or Resources in the mobile menu) - links',
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
        'Every page - mobile menu - link after the six sections; also the heading of the map page (/en/map/, being built)',
      'sections.learn':
        'Every page - mobile menu - link after the six sections; also the heading of the Learn page (/en/learn/, being built)',
      'sections.about':
        'Every page - mobile menu, and footer (About column) - link to the About page (/en/about/)',
    },
  },
  {
    title: 'Footer',
    shown: true,
    note: 'On every page, so also on the Turkish pages. The social media links stay hidden on every page until the addresses of the profiles are known (D31).',
    places: {
      'footer.sitemap':
        'Every page - footer - name of the footer navigation, read by screen readers',
      'footer.windows': 'Every page - footer - heading of the first column (the six sections)',
      'footer.learn': 'Every page - footer - heading of the second column',
      'footer.learnBasics':
        'Every page - footer, Learn column - link to the Learn page (/en/learn/)',
      'sections.benchToBedside':
        'Every page - footer, Learn column - link; also the heading of the Bench to Bedside page (/en/learn/bench-to-bedside/, being built)',
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
    note: 'The home page (M6) is in English only (/en/); there is no Turkish home page yet.',
    places: {
      'brand.tagline': 'Home page (/en/) - main heading',
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
      'home.digest.short': 'Home page - newsletter line under the figures',
      'home.digest.button': 'Home page - newsletter button and link',
    },
  },
  {
    title: 'Pages being built',
    shown: false,
    note: 'These stand-in pages for the sections that are not built yet exist only in English (/en/events/, /en/funding/, /en/papers/, /en/news/, /en/resources/, /en/map/, /en/learn/, /en/learn/bench-to-bedside/, /en/newsletter/).',
    places: {
      'placeholder.text': 'Pages being built - text under the heading',
      'placeholder.contact': 'Pages being built - contact line',
      'placeholder.home': 'Pages being built - link to the home page',
      'sections.newsletter':
        'Newsletter page (/en/newsletter/, being built) - heading and browser tab',
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
        'Jobs list - filters - fifth filter button (location), and the heading of its list of countries',
      'jobs.filters.region': 'Jobs list - Country filter - heading of the regions',
      'jobs.filters.regions':
        'Jobs list - Country filter - the regions; also on the chips of active filters',
      'jobs.filters.searchInList':
        'Jobs list - Subfield, Method and Country filters - field that narrows the list of choices as you type',
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
      'jobs.filters.more': 'Jobs list - filters - last filter button (and its panel)',
      'jobs.filters.stage': 'Jobs list - More filter - heading of the career stages',
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
        'Subfields page (/en/subfields/) - heading and browser tab; also in the path above the heading of each subfield page',
      'subfields.description': 'Subfields page - description in search results and link previews',
      'subfields.home':
        'Subfields page and subfield pages - path above the heading (breadcrumbs) - first link, to the home page',
      'subfields.intro': 'Subfields page - text under the heading',
      'subfields.hubDescription':
        'Subfield page (/en/subfields/…/) - description in search results and link previews',
      'subfields.positions': 'Subfield page - heading of the open positions',
      'subfields.allPositions': 'Subfield page - link under the positions, when there are more',
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
      'account.signOut.heading': 'Account - heading of the section about signing out',
      'account.signOut.text': 'Account - paragraph about signing out everywhere',
      'account.signOut.everywhere': 'Account - Sign out everywhere button',
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
        'Sign-in and account pages - message at the top when something went wrong',
      'outcome.error.failedReference':
        'Sign-in and account pages - message at the top when something went wrong, with the reference that finds it in our log',
    },
  },
  {
    title: 'Save buttons and saved positions',
    shown: false,
    note: `The Save buttons are on the jobs list and the job pages, and the saved positions on /en/account/saved/, all only in English, ${ENGLISH_ONLY}. They show only once a way of signing in is switched on.`,
    places: {
      'save.label':
        "Jobs list (each position), job page (under the heading) and saved positions - the Save button; screen readers hear the position's title after it; also on the sign-in page (/en/sign-in/), when already signed in and opened from a Save button's link",
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
        'Every automatic email (the outcome of a suggestion, the confirmation of a report, a sign-in link, a link to add an address) - first line',
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
      'emails.automatic': 'Every automatic email - line before the signature',
      'emails.signature': 'Every automatic email - signature',
    },
  },
]
