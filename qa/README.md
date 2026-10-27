# Yulex QA harness

Read-only visual and structural checks for the Yulex Webflow site. It only sends GET/HEAD requests and drives a headless Chromium. It never submits forms and never touches the Webflow API or Designer.

Targets: live `https://www.yulex.ca`, staging `https://yulex-staging.webflow.io`. French is at the root, English under `/en-ca`.

## Run

```sh
cd qa && npm install          # once; Chromium comes from `npx playwright install chromium`
node run.mjs                                   # both targets, all pages/locales/widths, with diff
node run.mjs --target staging --pages home,profile --widths 375 --locales fr
node run.mjs --baseline --target live          # write qa/baseline/live/ (screens + baseline.json + report)
node run.mjs --compare-baseline --target staging   # fresh staging capture vs qa/baseline/live/
node run.mjs --report-only --target both       # re-render baseline reports from baseline.json (no browsing)
```

Flags: `--target live|staging|both`, `--pages <keys or types>`, `--widths 1920,1440,900,375`, `--locales fr,en`, `--baseline`, `--diff` / `--no-diff`, `--compare-baseline`, `--report-only`, `--concurrency 3`.

- Normal runs write `qa/output/<timestamp>/` with `report.html`, `report.json`, `live/`, `staging/` and `diff/` (git-ignored).
- `--baseline` writes `qa/baseline/<target>/` with `screens/`, `baseline.json` (every check result, the link results and a `capturedAt` ISO time, no git SHA) plus a report. A run with `--pages/--widths/--locales` merges into the existing baseline instead of replacing it. It stays on this machine and is never committed (it holds screenshots and text of the live site, people included); back it up outside the repo.
- `--compare-baseline` captures a target fresh (staging unless told otherwise) and diffs it against the local live baseline. It does not re-capture live. This is the main use after Webflow changes: staging-after vs live-before.
- Exit code: always 0 for `--baseline`; for other runs non-zero only on a crash. Failing checks never change the exit code.

Pages live in `pages.json` (`key`, `type`, FR `path`, optional `expectStatus`, optional `paths.<locale>` override without the locale prefix). Add a page there and it is picked up everywhere. `--pages` accepts keys or types (`profile` selects both profiles).

## Capture rules

- Widths 1920 / 1440 / 900 / 375, viewport height 900. 1920 is Webflow's widest breakpoint (xxl), whose rules nothing below it exercises; check 2560 by hand now and then (`--widths 2560`), since the container caps the layout there. 375 uses `isMobile` + `hasTouch` at device scale factor 1 (a factor of 2 pushes the longest pages past Chromium's ~16k px screenshot limit). All overflow measurements are CSS px.
- Before each capture: `load`, `networkidle` (15 s timeout, then continue), 1.5 s for Webflow/Finsweet scripts, reduced motion + `transition/animation: none`, lazy images forced eager, a scroll to the bottom and back to the top, fonts and images awaited.
- Cookie banner (CookieYes): never clicked. These selectors are hidden by injected CSS before measuring and screenshotting: `.cky-consent-container`, `.cky-overlay`, `.cky-modal`, `.cky-btn-revisit-wrapper`.
- Analytics hosts (Google Analytics/Tag Manager, Meta, LinkedIn, Hotjar, Clarity) are blocked so QA traffic stays out of the client's stats.
- Screenshots are full page, cropped to the viewport width and to 12000 px tall (`truncated` is flagged if a page is taller). Images from different pages can have different sizes; see Pixel diff.

## Checks

Every page x locale x width on each requested target.

1. **Screenshot**: full page PNG.
2. **Pixel diff** (live vs staging, or baseline vs fresh): pixelmatch, threshold 0.1, anti-aliasing ignored. Reports mismatch % and writes a diff PNG when non-zero. If heights (or widths) differ, the overlapping top-left area is compared and the delta is reported; any size delta is red. Amber above 0.1 %, red above 2 %.
3. **Border probe** (model-agnostic, see below): open and doubled edges per card, summarised per grid.
4. **One h1**: visible and hidden `h1` counted separately (visible via `checkVisibility`). Green = exactly 1 visible and 0 hidden, amber = 1 visible plus hidden ones, red = 0 or 2+ visible. **Landmarks**: counts of `main`/`[role=main]`, `header`/`[role=banner]`, `footer`/`[role=contentinfo]`, `nav`/`[role=navigation]`. Green = all four present, red = no `main` or no `footer`, amber otherwise. Webflow's navbar carries `role="banner"`, so the header count is 1 on most pages even though there is no `<header>` element.
5. **Horizontal overflow**: `max(documentElement.scrollWidth, body.scrollWidth) > clientWidth`. Lists the widest elements whose right edge is more than 1 px past the viewport, excluding anything inside an ancestor with `overflow-x` hidden/clip/auto/scroll, and fixed elements.
6. **webflow.io links**: `a[href]` whose raw source href is absolute and contains `webflow.io`. Relative links that merely resolve to webflow.io on staging are not flagged.
7. **4xx/5xx links**: every unique http(s) href from all crawled pages of a target (fragments dropped; `mailto:`, `tel:`, `javascript:` and bare `#` skipped), HEAD with GET fallback, 4 at a time with a 250 ms delay, results cached within a run. Anything with status 400+ or unreachable (status 0) is listed. External 403/429/999 (LinkedIn etc.) carry a "may block automated requests" note; they are bot walls, not necessarily broken links. A staging 404 on `/paiement` would be annotated as expected (the payment terminal is served outside Webflow).

### Border probe

Card grids draw their dashed 2 px borders in different ways (container borders, per-card borders, `:last-child` patches, a separate model on the home page), so the probe never asks who draws a line.

1. Collect every rendered border segment on the page from every element's computed `border-*-width/style/color` and its box (transparent and zero-width borders skipped).
2. Candidate cards: children of a grid/flex container (or `.w-dyn-items`) that share the same class signature (state classes such as `w--*`, `is-*` ignored), are at least 40 x 40 px, number 2 or more and tile (at least 75 % of them touch a sibling within 3 px).
3. For each of a card's four edges, take the segments whose stroke centre is within 2 px of the edge line and that overlap it; cluster strokes that overlap by more than half their width (same pixels = one line; strokes that merely touch, such as one card's bottom plus the next card's top, stay separate and count as doubled); a line counts if the union of its segments covers at least 80 % of the edge length.
4. Per card: top/right/bottom/left = 0 (open), 1 (ok) or 2+ (doubled). Per grid: open and doubled edge counts, per card edge (a divider shared by two cards is seen by both). Groups with no border at all anywhere are reported as "no borders" and left out of the totals.

Limits: borders drawn with pseudo-elements, `box-shadow`, `outline` or `border-image` are not seen; `overflow: hidden` clipping of a border is not modelled.

Validated on live: at 375 on `/expertises` every card has an open left edge (9 of 9); at 1440 the grid is a closed box with no doubles; at 375 on `/` the team grid has open right edges and doubled dividers. Merging strokes by a plain 2 px centre distance would fuse touching card borders and hide the doubling, which is why the clustering is overlap-based.

## Masks

Nondeterministic regions are painted over by Playwright's `mask` option (magenta `#ff00ff`) for the pixel diff. They are listed in `pages.json` under `masks` (`selector`, `pages`, `reason`).

- Home: `.teammate-list` on live, `[data-yx-home-team]` after the rebuild (the team grid is shuffled on every load).

When a mask applies, a second screenshot `<page>.<locale>.<width>.masked.png` is saved next to the plain one and the diff uses the masked pair; the plain one stays unmasked for inspection. Report thumbnails use the masked image. Stability was checked by re-capturing live against the live baseline: 0 pixels differed on all 102 captures, so no other region needed a mask. Border-probe numbers for the home team grid can still vary slightly between loads because of the shuffle.

## Known baseline failures (live, before any change)

Expected, shown red or amber in the report; the staging column marks results identical to live with hatching.

- Several visible `h1` on 5 page types: home, team, team profiles, expertises, expertise template. None on the affiliation template. The expertise template also has one hidden `h1`.
- No `<main>` and no `<footer>` anywhere; no `<header>` element (the navbar's `role="banner"` is the one header hit).
- Open or doubled card edges: expertises (375: left edge open), affiliations and about (375), team (1440 and 375), home (900 and 375: open right edge, doubled dividers).
- Team profiles overflow horizontally at 375 (page is 436 px wide, culprit `.profile-slider-wrapper`, 496 px wide), plus a 10 px overflow on the English privacy page at 375.
- `webflow.io` links in the prev/next fallback cards on content, affiliation and about templates. The expertise template had none for the sampled item (litige), probably because it is not first or last in its collection.
- Dead links found inside content: a PDF on the old `yulex.ca` WordPress path (404), `https://yulex.ca/en/team/` (404).

## Files

```
run.mjs            CLI and orchestration
pages.json         page list and masks
lib/config.mjs     targets, locales, widths, timings
lib/capture.mjs    browser capture of one page x locale x width
lib/inpage.mjs     code that runs inside the page: border probe, h1/landmarks/overflow/links
lib/diff.mjs       pixelmatch diff and report thumbnails
lib/links.mjs      link status checker
lib/report.mjs     report.html rendering and red/amber/green rules
baseline/<target>/ local baseline (gitignored)
output/            run output (git-ignored)
```
