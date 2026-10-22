# Next task

Status: **open**
Written: 2026-10-22, by the operator's planning chat (Claude) on the operator's behalf.

## How this file works

- The operator clears the Claude Code session after each task and then says: "Pull main, then read docs/NEXT.md and do it." Act on this file only when the operator asks you to in the session.
- `docs/STATUS.md` is your one-page handoff: what is done, what is live, open decisions and the next step. Read it before this file, and update it at the end of every task.
- When the task below is finished, set the status above to **done**, with the date and the pull request numbers, in your last pull request. The planning chat then replaces this file with the next task.

## Task: M13, the signature hero (the 3D brain on the home page)

**Why:** the operator wants the site to draw people in as much as it serves them: its look matters as much as its function. So M13 comes forward, at the operator's request (2026-10-22), ahead of the lawyer packet and of M8–M10, M12 and M14.
- **Record it** as D60, the next free number.
- **The bar is high:** it should look polished and alive, never like a tech demo. When in doubt, choose fewer and finer effects.
- **Private:** everything stays behind the site-wide password. The home page goes public with the launch (D39), unless the operator also wants the hero on the M2 coming-soon page (section 1).
- **The lawyer packet** (`docs/NEXT.md` as of #121) is parked again. The planning chat puts it back when the operator says so, with its decisions numbered from the next free D.

Start by reading `CLAUDE.md`, `docs/STATUS.md` and:
- in `PLAN.md`: §10 (the storyboard, its budgets and technology), §17.1–§17.3, §20's M6 notes (the poster), and D12, D18, D41, D45, D47 and D55;
- the home page: `src/app/(frontend)/en/page.tsx`, `src/components/home/`, and `tools/poster/` with its README;
- `public/brand/` (the 6b mark), `tests/e2e/budgets.spec.ts`, and `withSiteCsp` in `tests/e2e/map.ts`.

### 1. First, with the operator (in Turkish)

Ask these together at the start; the operator may accept the recommendations at once.
- **The coming-soon page at M2.** The plan puts the hero on the full home page only, and that page stays private until the launch. From M2 until the launch, the public sees the coming-soon page (D41), possibly for months.
  - Ask whether the coming-soon page should get the hero too: without the window links, since they lead to private pages, and with the Glia Notes signup as its action.
  - The planning chat recommends yes: it is the first thing the public will see.
- **Phones.** §10.2 lets a phone load the 3D layer only when it reports at least 6 GB of `deviceMemory`. iPhones never report it, so every iPhone would see the poster only, and much of the audience will come from Instagram on phones.
  - The planning chat recommends: on a phone that does not report its memory, try the 3D layer at the phone's lighter quality (§10.5).
  - Keep it only if the run-time check of §10.3 passes: built within 1.5 s, and the first 60 frames at 30 fps or more on average. The other checks of §10.2 stay as they are.
  - If the operator agrees, change §10.2 in `PLAN.md` and record it with D60.
- **The brain model.** §10.5 asks for a point cloud from an openly licensed brain surface model, derived from real data:
  - CC0 or CC BY only (for example from NIH 3D, which states each model's licence), seen from the side like the poster;
  - show the operator its source, its licence and the credit line for the About page's "Data and credits";
  - the About page is approved, so add the line only once the operator has approved its words.
- **Licences, for the record:**
  - confirm GSAP's current terms and resolve the `[U]` of §10.6;
  - if those terms restrict a site like this one, stop and tell the operator;
  - Three.js is MIT.

  No new service: the libraries and the model are served from our own origin, so `docs/vendors.md` stays as it is.

### 2. Build it as §10 plans it

- **Layers and frames:**
  - the layers L0–L2 of §10.1;
  - the checks of §10.2 (with the phone rule of section 1, if approved);
  - the frames F0–F6 of §10.3;
  - the fallback and reduced motion of §10.4.
- **Budgets (§10.5 and §17.3):**
  - the hero's JavaScript ≤230 KB gzip, measured in CI;
  - the point cloud ≤150 KB;
  - the home page's first JavaScript stays ≤140 KB;
  - no effect on LCP (the H1 stays the LCP element);
  - no layout shift;
  - no task over 50 ms during setup;
  - 3D and GSAP only on the home route.
- **Our own origin only:** no CDN, and nothing fetched from another site at run time. The site's CSP allows no `blob:` workers: check the hero under it with `withSiteCsp`.
- **Windows:** label only the built ones (`LIVE_WINDOWS`, D55): Jobs today. A later window appears around the brain when its milestone adds it to the list, as it does on the poster.
- **The logo target:** a build script samples the 6b mark into target positions (§10.3). Never redraw the mark.
- **The poster stays layer L1.** The 3D brain's first frame should match it closely enough for the cross-fade: the same view and the same size.
  - If they differ too much, regenerate the poster from the same model with `tools/poster`, keeping it ≤15 KB.
  - Never edit `HomePoster.tsx` by hand.
- **Browser storage:** the hero may store something, for example that it already played in this session.
  - List it in the cookies and storage draft, which stays a draft.
  - Say so in the report.
- **Tests:**
  - the budgets;
  - the hero's chunk is never requested on another route, nor when a check fails: reduced motion, Save-Data, a small screen without the phone rule, no WebGL2;
  - the page is complete without JavaScript and in forced colours;
  - keyboard focus on a label does what hover does (F3);
  - axe on the home page in both states.
- **Pull requests:** two or three:
  1. the groundwork: the model, the point cloud, the logo target, the checks;
  2. the scene with its fallbacks;
  3. the polish, and the coming-soon version if the operator wants one.

### 3. Let the operator see it before the polish

- **The first version:** when F0–F3 and F5 run, merge it, so that it deploys behind the password.
- **An independent reviewer first:** someone who has not seen the code looks at recordings of the hero, at a desktop and a phone size, in light and dark. What to look for:
  - the motion;
  - the legibility of the labels;
  - the contrast;
  - anything that looks cheap or stutters.
- **Then the operator:**
  - show the address and the reviewer's recordings or screenshots;
  - ask the operator to open it on their own phone too (the real-device check of §17.2);
  - wait for the operator's go or changes before F4's polish and the coming-soon version.
- **The anatomy:** Nuray's look at the poster's anatomy (D47) can include the 3D brain. Nothing waits for it.

### 4. Checks

- **Lighthouse:** `pnpm lighthouse:local` on the home page, before and after. Run `pnpm lighthouse:prod` only if the operator asks.
- **Frame rate:** the quality steps of §10.5 work, and a slow device stays on the poster.
- **The coming-soon version, if built:**
  - its public files (the point cloud, say) are in `src/lib/public-pages.ts`, and `pnpm caddy:public` has been run;
  - `tests/e2e/m2.spec.ts` covers it.

### On the server

- **Nothing** beyond the automatic deploys of merges to `main`, behind the password.

### Not in this task

- M8–M10, M12 and M14;
- the lawyer packet;
- "Update the jobs": it runs only on the operator's own command;
- approving or publishing any text;
- the M2 switch, or making anything public.

### Report

At the end, one short report in plain language:
- **Decisions:** D60 and the operator's answers in section 1;
- **What a visitor sees:** on a desktop, on a phone, with reduced motion, without JavaScript;
- **Sizes:**
  - the hero's JavaScript;
  - the point cloud;
  - the home page's first JavaScript;
  - Lighthouse before and after;
- **Licences and credits:** the model, GSAP, Three.js;
- **CI minutes:** how many this task used.
  - On 2026-10-22 GitHub reported the repository as public (`gh api repos/ismailtufan123/gliagora --jq .visibility`), and the operator has not yet said whether that is wanted.
  - While it is public, GitHub's standard runners cost it no minutes. Say which it is when you start.
  - If it is private again, about 360 of October's 2,000 are left by the last count, and November starts again at 2,000. If fewer than 150 remain before a code pull request, stop and tell the operator.

### Working rules

Follow `CLAUDE.md`:
- one pull request per step, merged when its checks pass;
- CI minutes are limited (D46), so run every check locally before pushing, and put documentation into the same push;
- stop and ask only for rules (a) to (c), for section 1, and for section 3's review.
