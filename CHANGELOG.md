# Changelog

Semver. Each tag is a build of `dist/index.js`, served by jsDelivr at that tag.

## Deployments

| Tag | Where | Date | Notes |
|---|---|---|---|
| v0.1.2 | staging | 2026-10-28 | `dates`: French month names on French pages (article byline) |
| v0.1.1 | staging | 2026-10-27 | Related top-up identifies a card by its item link, not its first (author) link |
| v0.1.0 | staging | 2026-10-27 | First bundle: coverflow, home team, previous/next bar, related content |

## v0.1.2 (2026-10-28)

- `dates`: an element marked `data-yx-date` (the article byline date, bound with the format `MMMM D, YYYY`) is rewritten with `Intl.DateTimeFormat` in the page's `<html lang>`, so French pages read « 22 octobre 2021 » instead of Webflow's English « October 22, 2021 ». English pages are untouched. Webflow's date format has no locale, so there is no native fix.

## v0.1.1 (2026-10-27)

- `related`: a card is identified by its item link (the first link outside a nested list, not `#`), not its first link. Capsule and podcast cards open with the author link, so a pool card that shared an author with a row card was skipped as a duplicate and rows stayed short. Test with two pool cards sharing an author.

## v0.1.0 (2026-10-27)

- `coverflow`: current card from `w--current`, 5 cards from 480 px and 3 below, tone by list index modulo 3, wrap-around, re-lays out on resize. No per-member order numbers.
- `home-team`: unbiased shuffle once per load, CTA moved into the list, layout 13 / 7 / 5 items by width, Finsweet attributes removed from the list and the CTA.
- `prevnext`: « previous / next » links from the hidden list with real wrap-around, hidden below 2 items, re-reads the list while Finsweet loads more items.
- `related`: each row topped up to 3 from the shared pool by type, no duplicates, `own` / `latest` heading. Creates the items wrapper for an empty row, because Webflow drops it.
- Global styles: state CSS for all four modules (`docs/global-styles/global-styles_custom.html`).
- Tests (`pnpm test`, Playwright on fixture markup at 375 / 900 / 1440 px).
