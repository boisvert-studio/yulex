import { isReady, warn } from './utils';

// Click-to-load YouTube. The Contenu template's Embed holds
//   <div data-yx-video="{{Lien YouTube}}"><a href="{{Lien YouTube}}">Voir la vidéo sur YouTube</a></div>
// The link is the fallback without JS and gives the play button its label. Nothing is requested from
// youtube.com before the visitor clicks, so no YouTube cookie is set before a choice (Loi 25), and the
// player that loads on click is youtube-nocookie.com.

const ID = /^[\w-]{11}$/;

/** The video id from a youtu.be, watch, embed or shorts URL; null when there is none. */
export const youtubeId = (raw: string) => {
  try {
    const url = new URL(raw.trim());
    const host = url.hostname.replace(/^www\.|^m\./, '');
    let id: string | null = null;
    if (host === 'youtu.be') [id] = url.pathname.slice(1).split('/');
    else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
      id =
        url.searchParams.get('v') ??
        url.pathname.match(/^\/(?:embed|shorts|live)\/([^/]+)/)?.[1] ??
        null;
    }
    return id && ID.test(id) ? id : null;
  } catch {
    return null;
  }
};

const STYLE = `
[data-yx-video]{position:relative;aspect-ratio:16/9;width:100%;background:#000;overflow:hidden}
[data-yx-video] .yx-video_play{all:unset;position:absolute;inset:0;cursor:pointer;display:block}
[data-yx-video] .yx-video_play img{width:100%;height:100%;object-fit:cover;display:block}
[data-yx-video] .yx-video_play::after{content:"";position:absolute;left:50%;top:50%;width:68px;height:48px;transform:translate(-50%,-50%);border-radius:12px;background:rgba(0,0,0,.72) url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath fill='%23fff' d='M8 5v14l11-7z'/%3E%3C/svg%3E") center/28px no-repeat;transition:background-color .15s}
[data-yx-video] .yx-video_play:hover::after{background-color:#c00}
[data-yx-video] .yx-video_play:focus-visible{outline:3px solid #fff;outline-offset:-6px}
[data-yx-video] iframe{position:absolute;inset:0;width:100%;height:100%;border:0}
`;

const addStyle = () => {
  if (document.getElementById('yx-video-style')) return;
  const style = document.createElement('style');
  style.id = 'yx-video-style';
  style.textContent = STYLE;
  document.head.append(style);
};

/** Replace each `[data-yx-video]` fallback link with a thumbnail that loads the player on click. */
export const startVideo = () => {
  const roots = document.querySelectorAll<HTMLElement>('[data-yx-video]');
  if (!roots.length) return;
  addStyle();

  roots.forEach((root) => {
    if (isReady(root)) return;
    const id = youtubeId(root.getAttribute('data-yx-video') ?? '');
    if (!id) {
      warn(
        `data-yx-video: "${root.getAttribute('data-yx-video')}" is not a YouTube URL; fallback link kept.`
      );
      return;
    }
    const label = root.querySelector('a')?.textContent?.trim() || 'YouTube';

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'yx-video_play';
    button.setAttribute('aria-label', label);
    const img = document.createElement('img');
    img.src = `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
    img.alt = '';
    img.loading = 'lazy';
    button.append(img);

    button.addEventListener('click', () => {
      const frame = document.createElement('iframe');
      frame.src = `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0`;
      frame.title = label;
      frame.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
      frame.allowFullscreen = true;
      button.replaceWith(frame);
      frame.focus();
    });

    root.replaceChildren(button);
    root.setAttribute('data-yx-ready', 'true');
  });
};
