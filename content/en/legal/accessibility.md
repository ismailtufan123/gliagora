## Our aim

Gliagora | Neuroscience wants everyone to be able to use this site: with a keyboard alone, with a screen reader or a screen magnifier, with larger text, with their own colours, on a small phone or on a slow connection.

Our target is level AA of the Web Content Accessibility Guidelines (WCAG) 2.1. [TO DECIDE: C6 – whether to name WCAG 2.2 level AA as the target instead; the checks below already cover some of its new criteria]

This statement covers the public pages of gliagora.com. It describes the site as it is today, and we change it when the site changes. It is our own assessment: no outside expert has audited the site. [TO DECIDE: B21 – whether any accessibility law applies to Gliagora, and whether this statement must then follow a set form]

## How far we are

Our automated tests find no page that fails WCAG 2.1 at level A or AA. We do not claim more than that yet. Automated tests find only some of the barriers people meet, and nobody has gone through every page with a screen reader. The section "Known limitations" lists what is missing.

## What we built in

- **Keyboard:** every page starts with a "Skip to main content" link. Menus, filters, the search box, dialogs and forms work with the keyboard alone. The control that has focus always shows an outline and is never hidden under the fixed header.
- **Structure:** pages use headings, lists, landmarks and labelled form fields, so that a screen reader can announce them and move through them.
- **Text size and zoom:** pages fit a screen 320 pixels wide, which is the same as a laptop at 400% zoom, without scrolling sideways. That also holds with text enlarged to 200% and with wider spacing between letters, words and lines.
- **Colour and contrast:** text and controls meet the AA contrast ratios in light and in dark mode. The site follows the light, dark or high-contrast setting of your device. We do not give information by colour alone.
- **Motion:** the site has very little animation, and it follows your device's "reduce motion" setting.
- **Without JavaScript:** pages, menus, lists and filters work without JavaScript. The map and the forms' spam check need it (see "Known limitations").
- **Forms:** if something is missing or wrong, a summary at the top of the form takes focus and leads to each field that needs a change.
- **Signing in:** there is no password to remember and no puzzle to solve. You sign in with a link we email you, or with Google or ORCID.
- **Languages:** each page says which language it is in. In our longer texts, a phrase in another language is marked, so that a screen reader pronounces it correctly.
- **The map:** a "Skip the map" link comes before the map, and the same institutions are in a list on the same page, each with a link to its own page. The map never traps the keyboard.

## How we test

Every change to the site is tested automatically before it goes live. The tests open each kind of page in a browser, in light and in dark mode, at the size of a desktop screen and of a phone, and check:

- the WCAG 2.0 and 2.1 rules of levels A and AA that a program can check, with the open-source tool axe-core. A change with a serious or critical finding cannot go live;
- keyboard use: the skip link, the menus, the search box, the filters, the map's panel, the forms and their error messages, and where focus goes after each step;
- that a control with keyboard focus is not hidden under the fixed header (in WCAG 2.2, "Focus Not Obscured");
- that pages fit a screen 320 pixels wide, also with text at 200%, with wider text spacing and with texts 40% longer than the English ones, as translations can be;
- the contrast of every pair of colours the design uses;
- that a page loads nothing from other websites.

On 7 October 2026 we also ran axe-core's rule for WCAG 2.2 level AA (the size of touch targets) and its best-practice rules on every kind of page. With those and the rules above, it reported no finding of any severity. It could not measure the contrast of a few texts: the labels on the home page's picture, the credits in the corner of the map, and cells of a wide table on a phone. Checking those by eye is part of the checks by hand listed under "Known limitations".

We also measure how fast pages load, because a slow page is hard to use on an old phone or a weak connection.

## Known limitations

- **No test by hand with screen readers yet.** Before the site opens to the public, we will go through every kind of page with the keyboard alone and with screen readers (Orca on Linux, VoiceOver on iOS or macOS, TalkBack on Android), with zoom and in high-contrast mode, and on a mid-range phone. We will add what we find to this page. [TO DECIDE: pre-launch checks – rewrite this point after them]
- **No outside audit.** No accessibility expert has audited the site, and we have not yet asked people with disabilities to test it. [TO DECIDE: C7 – whether to plan an outside audit or tests with users, and when]
- **High-contrast mode.** The site keeps its shape in your device's high-contrast (forced colours) mode, but our automated tests cover only part of it so far.
- **The map.** The map is drawn as a picture that a screen reader cannot read, and moving around in it is easiest with a mouse or a touch screen. What it shows is also in the list of institutions on the same page, and in the list of positions. Without JavaScript, or in a browser that cannot draw the map, the list stands in for it.
- **Forms need JavaScript.** Before a form is sent, your browser runs a short spam check. It asks nothing of you, but it needs JavaScript. Without JavaScript, please write to us by email instead.
- **Links that expire.** For security, a sign-in link works for 15 minutes. A link that confirms an email address or a data request works for 24 hours, and a link that confirms a Glia Notes signup for 7 days. If a link has expired, you can ask for a new one.
- **Other websites.** Every item links to its original page, for example an employer's posting. We cannot change those pages. Each item on Gliagora gives the key facts, so that you can decide before you follow the link.
- **Sections that are not open yet.** The page of a section that we have not built yet only says so.

## Tell us about a barrier

If something on Gliagora is hard or impossible for you to use, please [report it to us](/en/report/) or write to [hello@gliagora.com](mailto:hello@gliagora.com), in English or Turkish.

It helps us if you name the page, what you were trying to do, and the browser and any assistive technology you use, for example a screen reader. You do not need to tell us anything about your health or a disability, and we ask you not to send such details. [TO DECIDE: B21 – how to handle messages that reveal a disability]

We answer within 7 days. If we cannot remove the barrier quickly, we tell you what we plan to do and, where we can, give you the information you were looking for in another way. [TO DECIDE: C7 – the response time]

The [privacy policy](/en/legal/privacy/) explains what we do with your message.

## About this statement

We wrote this statement on 7 October 2026 from our own tests. We review it at least once a year, and whenever the site changes in a way that matters here. [TO DECIDE: C7 – how often to review this statement]
