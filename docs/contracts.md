# Data-attribute contracts

Every attribute the bundle reads or writes, per module. **Status: approved at Gate 1 (Danny, 2026-10-26); amended in stage 3 where marked *v0.1.0*.**

Rules for every module:

- Modules start from `src/index.ts` inside `Webflow.push` and do nothing when their root attribute is absent.
- **Modules read `data-yx-*` attributes and Webflow's own markers (`w--current`, `w-dyn-empty`), never class names.** Renaming a class in Webflow can't break a script.
- **State goes out as data attributes** (`data-yx-slot`, `data-yx-tone`, `data-yx-ready`) or the `hidden` attribute. The CSS that styles that state lives in Webflow's global styles embed, so it's in place at first paint, before the deferred bundle runs. A copy of that CSS is kept in `docs/` once written.
- **No interface text in the bundle.** Labels such as « Précédent » / « Suivant » are Webflow text, so the English locale translates them natively.
- Attributes go on Collection Lists or plain blocks, never inside a Webflow Component. (A Component can hold a plain Collection List, as the footer does, but not a list nested inside another list, so every list these modules touch sits outside Components.)
- A missing or malformed contract logs one `console.warn('[yx] …')` and leaves the page usable. No silent `return` on a broken contract.

Breakpoints are Webflow's: desktop ≥ 992 px, tablet 768–991, mobile landscape 480–767, mobile portrait < 480. Modules use `matchMedia` with these values and re-run when a query changes.

## coverflow.ts

Team profile pages: the current person large, two neighbours on each side, wrapping around the list. Replaces the `Position`-driven script.

| Attribute | On | Effect |
|---|---|---|
| `data-yx-coverflow` | the slider's Collection List items wrapper (`.w-dyn-items`); its direct children are the cards | Starts the module. The list may be sorted by anything (Created On, oldest first, decided). |
| (Webflow) `w--current` | the link inside the current person's card | Read. Its card's index in the list is the current position. Webflow adds it natively. |
| `data-yx-slot` | each visible card | Written: `-2` `-1` `0` `1` `2` (5 cards, ≥ 480 px) or `-1` `0` `1` (3 cards, < 480 px). Cards without it are hidden by CSS. Visible cards are moved into slot order. |
| `data-yx-tone` | every card | Written: list index modulo 3 (`0` blue, `1` purple, `2` green). Matches the Équipe grid, which colours by the same index under the same sort. |
| `aria-current="page"`, `tabindex="-1"` | the current card's link | Written. The current card isn't a tab stop that links to itself. |
| `data-yx-ready` | the root | Written when laid out: `true`, or `no-current` if no `w--current` link was found (the module warns and lays out from index 0). |

Retired with this module: the hidden `[data-current-order]` and `[data-order]` divs, the stray `fs-list-element="list"` on the slider list, and the `Position` sort.

CSS in the global embed: `[data-yx-coverflow] > :not([data-yx-slot]) { display: none }` (no flash of 21 cards before the script), slot sizes per breakpoint (72 / 108 / 288 px; from 480 to 767 px the same 1 : 1.5 : 4 proportions shrink fluidly so five cards always fit; 56 / 192 px for 3 cards within 343 px) *(v0.1.0: fluid band added, the fixed 56 / 84 / 224 px row is 600 px wide and would clip below 632 px)*, tones from the Theme colour variables. The slider wrapper also gets `min-width: 0; overflow: hidden` in its native class as a backstop.

## home-team.ts

Home page team pyramid: shuffled on every load (kept, decided), with the « Découvrez notre équipe » card in the middle row.

| Attribute | On | Effect |
|---|---|---|
| `data-yx-home-team` | the team Collection List items wrapper | Starts the module. |
| `data-yx-home-team-cta` | the call-to-action card (a block next to the list) | Moved into the list by the module. The Finsweet `fs-list-*` attributes on the list and on this card are removed: one owner for its position. |
| `data-yx-slot` | each visible item, the CTA included | Written: `0`…`n-1` in display order. CSS sizes the rows from it. |
| `data-yx-tone` | each person card (not the CTA) | Written: person index modulo 3, counted without the CTA. |
| `hidden` | the people beyond the visible count | Written. |
| `data-yx-ready` | the root | Written when laid out. |

Layout by width (CTA index in brackets): ≥ 1280 px, 13 items in rows 4 / 5 / 4 [6]; 768–1279 px, 7 items in rows 2 / 3 / 2 [3]; ≤ 767 px, one column of 5 items [2]. The mobile switch is at 767 px to match Webflow (today's script uses 768). The shuffle is an unbiased Fisher–Yates, run once per load; resizing re-lays out the same order.

The grid columns and the dashed border model (container top and left, cell right and bottom) are CSS in the global embed and native classes. The script no longer draws borders or sets inline grid styles.

## prevnext.ts

A compact « Précédent / Suivant » bar on tablets and phones (below 992 px), where the Finsweet previous/next cards are hidden today. Contenu, Expertise, Affiliation and À propos templates.

| Attribute | On | Effect |
|---|---|---|
| `data-yx-prevnext` | the bar (a native block, shown below 992 px by its class) | Starts the module. |
| `data-yx-prevnext-link` | two links inside the bar, values `prev` and `next` | `href` written. The link text is Webflow text (localised natively). |
| `data-yx-prevnext-label` | a text element inside each link | Written: the neighbour's title. |
| `data-yx-prevnext-list` | the template's hidden Collection List items wrapper (the one carrying `fs-list-element="list"`) | Read. The item holding the `w--current` link is the current one; neighbours are index ± 1 with wrap-around, so the bar loops for real. |
| `data-yx-prevnext-title` | the title element inside each hidden item | Read for the label. |
| `data-yx-ready` | the bar | Written. `hidden` on the bar if the list has fewer than 2 items. |

When Finsweet loads more items in the background (`fs-list-load="pagination"`, past 100 items), the module waits for Finsweet's list hook before reading the list. Desktop keeps the Finsweet cards and their dynamic fallbacks (decided).

## related.ts

Profile and expertise pages: three rows (articles, capsules, podcasts) of the content that person wrote or that's filed under that expertise, topped up to 3 with the latest of that type. Shared top-up pool (decided, Danny 2026-10-26).

| Attribute | On | Effect |
|---|---|---|
| `data-yx-related-section` | the section wrapper | Starts the module. |
| `data-yx-related-heading` | two headings in the section, values `own` and `latest` | `own` is bound to the person's or expertise's name (« Contenus de … »). The module shows `own` when any row has an own item, else `latest`. |
| `data-yx-related` | each row wrapper, value `article`, `capsule` or `podcast` | One row. |
| `data-yx-related-own` | the row's filtered list items wrapper | Read. List settings: Auteur(s) (or Expertise(s)) contains the current item, Type = the row's type, newest first, limit 3. **v0.1.0:** Webflow drops the items wrapper when a list is empty (only `w-dyn-list` > `w-dyn-empty` is rendered), so for an empty row the module creates a bare `div[role=list][data-yx-related-own].w-dyn-items` inside the row's `w-dyn-list`. A bare wrapper has none of the items wrapper's classes, so **the row's layout classes must sit on the Collection List wrapper (`w-dyn-list`) or the row block, not on the items wrapper**; the global styles give `.w-dyn-items` inside a row `display: contents`. |
| `data-yx-related-pool` | one hidden list items wrapper in the section | Read. All Contenus, newest first, limit 30. Its cards are the same post cards as the rows. |
| `data-yx-related-type` | each pool item (the Collection Item) | Read. Bound to the Type's slug, matching the row values. |
| `hidden` | rows with no item after the top-up | Written. |
| `data-yx-ready` | the section | Written: `own` if any row had an own item, else `latest`. The no-script heading rules apply only while it is absent. |

The module moves pool cards into each row, newest first, skipping any whose item link (`href`: the card itself if it is an anchor, else its first link outside a nested Collection List and not `#`; capsule and podcast cards open with the author list, so their first link is shared) is already in the row, until the row holds 3. A row the pool can't fill shows what it has; if a type is often short, raise the pool limit.

**Without the script** (CSS `:has()` in the global embed): rows show only their own items, a row with none is hidden, the pool stays hidden, and the `latest` heading shows when no row has an own item.

**Webflow page limits (help centre, checked 2026-10-23):** 40 Collection Lists per page including nested ones, and 10 nested lists per page. Today each template has one post list with two nested lists per card (authors, tags): 2 nested. This design has 3 own lists plus the pool, each card with two nested lists: 8 nested, and every card keeps authors and tags.

## dates.ts

French month names on French pages. Webflow's date format has no locale: a bound CMS date prints « October 22, 2021 » on every page. *(v0.1.2)*

| Attribute | On | Effect |
|---|---|---|
| `data-yx-date` | a text element bound to a CMS date with the format `MMMM D, YYYY` (the article byline) | Read. On a page whose `<html lang>` is not English, the text is rewritten with `Intl.DateTimeFormat(lang)` (« 22 octobre 2021 »). On English pages it is left as is. |
| `data-yx-ready` | the same element | Written once rewritten (or confirmed English). |

The page language comes from `<html lang>`, which Webflow sets per locale (`fr-CA`, `en-CA`). No month names are shipped for display: the English names are only used to read the printed date back, and the date is built in UTC so the day never shifts. Text that is not « Month D, YYYY » logs one `[yx]` warning and stays as printed. Without the script the French pages show Webflow's English text, as before.

## Global styles embed (no module)

CSS only, keyed on classes, so it isn't part of the attribute contract: the title swash (Figma order blue, purple, green, counted with `:nth-of-type`), the hover and underline rules, the dashed border model, and the module state CSS above. It lives in one site-wide embed, per Client-First.
