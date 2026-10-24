// Compact previous/next bar below 992 px. Self-starts on `[data-yx-prevnext]`.

export const startPrevNext = () => {
  const root = document.querySelector<HTMLElement>('[data-yx-prevnext]');
  if (!root) return;
};
