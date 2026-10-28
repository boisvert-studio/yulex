import { warn } from './utils';

// Webflow prints CMS dates in English whatever the locale (« October 22, 2021 »). These are the
// names it prints, only used to read the date back; the text shown comes from Intl in the page's language.
const ENGLISH_MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const ENGLISH_DATE = /^([A-Za-z]+) (\d{1,2}), (\d{4})$/;

/** Rewrite each `[data-yx-date]` in the page's language. English pages keep Webflow's text. */
export const startDates = () => {
  const dates = document.querySelectorAll<HTMLElement>('[data-yx-date]');
  if (!dates.length) return;

  const { lang } = document.documentElement;
  const english = !lang || lang.toLowerCase().startsWith('en');
  const format = english
    ? null
    : new Intl.DateTimeFormat(lang, {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        timeZone: 'UTC',
      });

  dates.forEach((el) => {
    if (el.hasAttribute('data-yx-ready')) return;
    if (!format) {
      el.setAttribute('data-yx-ready', 'true');
      return;
    }

    const match = ENGLISH_DATE.exec((el.textContent ?? '').trim());
    const month = match ? ENGLISH_MONTHS.indexOf(match[1]) : -1;
    if (!match || month < 0) {
      warn(`data-yx-date: "${el.textContent?.trim()}" is not « Month D, YYYY »; left as is.`);
      return;
    }

    el.textContent = format.format(new Date(Date.UTC(Number(match[3]), month, Number(match[2]))));
    el.setAttribute('data-yx-ready', 'true');
  });
};
