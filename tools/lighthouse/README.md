# Lighthouse against the deployed site

`run.mjs` measures the main templates with [Lighthouse](https://github.com/GoogleChrome/lighthouse),
as a phone and as a desktop, and compares each with the lab targets of PLAN §17.1 (performance at
least 90, accessibility 100, Core Web Vitals "good": LCP at most 2.5 s, CLS at most 0.1, and TBT at
most 200 ms in place of INP, which a lab cannot measure) and with the byte budgets of §17.3, counted
as `tests/e2e/budgets.spec.ts` counts them. It is run from the operator's computer, never in CI:
a run takes about 15 minutes, and CI minutes are limited (D46).

Lighthouse is a project of its own in this folder (`package.json`, `pnpm-lock.yaml`), installed here
the first time the script runs, so it never reaches the app's dependencies, its image or CI. The
browser is the Chromium of the end-to-end tests (`pnpm exec playwright install chromium`, or
`PLAYWRIGHT_CHROMIUM_EXECUTABLE`).

## The deployed site

```sh
ssh gliagora@45.144.214.78 sudo cat /root/site-password | pnpm lighthouse:prod
```

The site-wide password reaches the run only this way: piped from the server into the script's
standard input (D42). Never type it, and never put it in a file, a variable or an argument. The
script keeps it in memory and gives it to the browser as a request header. Lighthouse copies its
settings, that header included, into every report, so the script removes the header from each
report, searches the report for the password and the header's value before writing it, and searches
the written files once more at the end; if it finds either, it deletes the reports and stops. The
browser gives the header to every address a page asks for, so in such a run it can find no other
host than the site's. The password may hold letters, digits and `. _ ~ -` only (the runbook makes
it of letters and digits): any other could be spelled differently in a report and be missed.

The server has no positions before the launch, so its lists are empty and the job page is not
measured there ("Not measured"). Measure those templates locally as well.

## The app on this computer

```sh
pnpm build && pnpm start        # with the ROR test data and `pnpm fake:jobs` loaded
pnpm lighthouse:local           # BASE_URL, or http://localhost:3000
```

By default Lighthouse estimates a phone on slow 4G from a fast load, and the run against the
deployed site does that. On this computer every file arrives before the first paint, and the
estimate then counts all of them into LCP: the time until the whole page has loaded, a worst case
(2.0 to 2.6 s in October 2026). So the local run slows the browser down for real instead
(`--throttling applied`), which takes longer and shows when a phone would paint (1.5 s);
`--throttling estimated` gives the estimate.

## Options

`--runs 3` (the median run counts), `--only "home,jobs list"`, `--form mobile`, `--out <folder>`,
`--throttling estimated|applied`, `--origin <url>` for another site without a password; `--help`
lists them.

## What it writes

`lighthouse-reports/prod` or `lighthouse-reports/local` (not committed): a report per template and
device (`.html` to read, `.json` for the numbers), `summary.md` with the table the script prints,
and `summary.json`. Each run first removes the earlier run's files there. The folder is the
script's own: one that holds anything else (`--out .`) is refused, never emptied. The script exits
with 0 when every template meets its targets, with 1 when one misses a target or a budget, and
with 2 when the run itself failed.

## Updating Lighthouse

Change the version in `package.json`, then `pnpm install --ignore-workspace` in this folder, and
commit both files.
