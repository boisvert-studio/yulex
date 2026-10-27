// Home page team pyramid: shuffle and layout. Self-starts on `[data-yx-home-team]`.
import { children, isReady, warn, watchMedia } from './utils';

// Webflow's own breakpoints. `total` counts the CTA; `cta` is its index in display order.
const LARGE = '(min-width: 1280px)';
const MEDIUM = '(min-width: 768px)';
const LAYOUTS = {
  large: { total: 13, cta: 6 },
  medium: { total: 7, cta: 3 },
  small: { total: 5, cta: 2 },
};

/** Fisher–Yates, unbiased. */
const shuffle = <T>(items: T[]) => {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
};

/** Finsweet's `fs-list-*` attributes would fight the module over the card's position. */
const stripFinsweet = (el: Element) =>
  Array.from(el.attributes)
    .filter((attr) => attr.name.startsWith('fs-list-'))
    .forEach((attr) => el.removeAttribute(attr.name));

export const startHomeTeam = () => {
  const root = document.querySelector<HTMLElement>('[data-yx-home-team]');
  if (!root || isReady(root)) return;

  const cta = document.querySelector<HTMLElement>('[data-yx-home-team-cta]');
  if (!cta) warn('home-team: no [data-yx-home-team-cta], laying out the people only.');

  stripFinsweet(root);
  if (cta) stripFinsweet(cta);

  // One shuffle per load; resizing re-lays out the same order.
  const people = shuffle(children(root).filter((el) => el !== cta));
  if (!people.length) warn('home-team: the list has no items.');

  const large = watchMedia(LARGE, () => layout());
  const medium = watchMedia(MEDIUM, () => layout());

  function layout() {
    const { total, cta: ctaAt } = large.matches
      ? LAYOUTS.large
      : medium.matches
        ? LAYOUTS.medium
        : LAYOUTS.small;

    const sequence: HTMLElement[] = [...people];
    if (cta) sequence.splice(Math.min(ctaAt, sequence.length), 0, cta);

    let shown = 0;
    sequence.forEach((el, index) => {
      if (index < total) {
        el.hidden = false;
        el.setAttribute('data-yx-slot', String(index));
        if (el === cta) el.removeAttribute('data-yx-tone');
        else {
          el.setAttribute('data-yx-tone', String(shown % 3));
          shown += 1;
        }
      } else {
        el.hidden = true;
        el.removeAttribute('data-yx-slot');
        el.removeAttribute('data-yx-tone');
      }
      root!.append(el);
    });

    root!.setAttribute('data-yx-ready', 'true');
  }

  layout();
};
