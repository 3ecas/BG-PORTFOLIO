/* ==========================================================================
   BG — Motion portfolio · main.js
   No dependencies. Reads window.PORTFOLIO (content.js) and builds the page.

   Contents
   1. Setup & utilities        6. Highlights (pinned horizontal reel)
   2. Data                     7. Work: filters, masonry grid, index view
   3. Rendering helpers        8. About, contact, footer
   4. Frame loop & media       9. Timeline rail, cursor, theme, reveal
   5. Nav + hero (kinetic)    10. Viewer + player, router, boot
   ========================================================================== */
(() => {
  'use strict';

  /* ---------- 1. Setup & utilities ---------- */
  const DATA = window.PORTFOLIO || {};
  if (!window.PORTFOLIO) {
    // content.js didn't run: nearly always a typo (curly quotes, a missing comma). Say so on the page.
    document.addEventListener('DOMContentLoaded', () => {
      const note = document.createElement('p');
      note.setAttribute('role', 'alert');
      note.style.cssText = 'position:fixed;left:16px;right:16px;top:16px;z-index:300;margin:0;padding:14px 16px;border-radius:4px;background:#ffdf5d;color:#111;font:500 15px/1.45 system-ui,sans-serif';
      note.textContent = 'content.js could not be read, so the site has no content. This is usually a typo in content.js: curly quotes instead of straight ones, or a missing comma between projects. Open the browser console (F12, or Cmd+Option+J on a Mac) to see the line.';
      document.body.appendChild(note);
    });
  }
  const SITE = DATA.site || {};
  const HERO = DATA.hero || {};
  const ABOUT = DATA.about || {};
  const CONTACT = DATA.contact || {};
  const root = document.documentElement;

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const pad = (n, l = 2) => String(Math.max(0, Math.floor(n))).padStart(l, '0');
  const easeOutExpo = (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const slugify = (s) => String(s).toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  const list = (v) => [].concat(v == null ? [] : v).filter((x) => x !== '' && x != null);
  const safe = (fn, ...args) => { try { return fn(...args); } catch (err) { console.error('[portfolio]', err); return undefined; } };
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* storage unavailable */ } },
  };

  const mqReduce = matchMedia('(prefers-reduced-motion: reduce)');
  const mqFine = matchMedia('(hover: hover) and (pointer: fine)');
  const mqCoarse = matchMedia('(pointer: coarse)');
  const mqPhone = matchMedia('(max-width: 560px)');
  let reduced = mqReduce.matches;
  // "Still" is the visitor's own pause for everything that moves by itself (WCAG 2.2.2).
  let still = store.get('bg-still') === '1';
  const saveData = !!(navigator.connection && navigator.connection.saveData);
  const ambientOK = () => !reduced && !still;
  const autoplayOK = () => ambientOK() && !saveData;
  const hasVT = typeof document.startViewTransition === 'function';

  /** Seconds → SMPTE-style non-drop-frame timecode HH:MM:SS:FF */
  function timecode(sec, fps = 25) {
    const r = Math.max(1, Math.round(fps));
    // Frames are counted at the real rate and labelled at the nominal one; 29.97 and
    // 23.976 are treated as the exact NTSC rates (30000/1001, 24000/1001).
    const rate = Math.abs(fps - r / 1.001) < 0.005 ? r / 1.001 : (fps || r);
    const frames = Math.floor(Math.max(0, sec || 0) * rate + 1e-4);
    const s = Math.floor(frames / r);
    return `${pad(s / 3600)}:${pad((s / 60) % 60)}:${pad(s % 60)}:${pad(frames % r)}`;
  }
  /** Seconds → 1:05 */
  function clock(sec) {
    const t = Math.max(0, Math.round(sec || 0));
    const m = Math.floor(t / 60);
    return m >= 60 ? `${Math.floor(m / 60)}:${pad(m % 60)}:${pad(t % 60)}` : `${m}:${pad(t % 60)}`;
  }
  /** "1:05" | "65" | 65 → 65 */
  function parseDuration(d) {
    if (typeof d === 'number') return d;
    if (!d) return 0;
    return String(d).split(':').reduce((acc, part) => acc * 60 + (parseFloat(part) || 0), 0);
  }
  const NAMED_RATIOS = [['16:9', 16 / 9], ['9:16', 9 / 16], ['1:1', 1], ['4:5', 4 / 5], ['5:4', 5 / 4], ['4:3', 4 / 3], ['3:4', 3 / 4], ['2:3', 2 / 3], ['3:2', 3 / 2], ['1.85:1', 1.85], ['2.39:1', 2.39], ['21:9', 21 / 9], ['2:1', 2]];
  function parseRatio(fmt) {
    const f = String(fmt || '16:9').toLowerCase().trim();
    if (/^(v|vertical|portrait)$/.test(f)) return { ratio: '9:16', aspect: 9 / 16 };
    if (/^(h|horizontal|landscape)$/.test(f)) return { ratio: '16:9', aspect: 16 / 9 };
    const m = f.match(/^(\d+(?:\.\d+)?)\s*[:x/×]\s*(\d+(?:\.\d+)?)$/);
    if (m && +m[1] > 0 && +m[2] > 0) {
      const aspect = +m[1] / +m[2];
      // Pixel sizes like 1920:1036 get the familiar name within 2%.
      const named = NAMED_RATIOS.find(([, a]) => Math.abs(aspect / a - 1) < 0.02);
      if (named) return { ratio: named[0], aspect };
      let a = +m[1], b = +m[2];
      if (Number.isInteger(a) && Number.isInteger(b)) {
        const g = (x, y) => (y ? g(y, x % y) : x);
        const d = g(a, b); a /= d; b /= d;
      }
      const ratio = a <= 32 && b <= 32 ? `${a}:${b}` : (aspect >= 1 ? `${aspect.toFixed(2)}:1` : `1:${(1 / aspect).toFixed(2)}`);
      return { ratio, aspect };
    }
    return { ratio: '16:9', aspect: 16 / 9 };
  }
  /** Vimeo/YouTube: accepts an ID or any pasted share/watch/embed link. */
  function embedURL(p) {
    if (p.vimeo) {
      const s = String(p.vimeo).trim();
      // Prefer the id after /video/ or /videos/ (showcase, album, manage, player links),
      // then vimeo.com/<id>, then a bare id. The unlisted hash follows the id or sits in ?h=.
      const id = (s.match(/\/videos?\/(\d{5,})/) || s.match(/vimeo\.com\/(?:channels\/[^/?#]+\/)?(\d{5,})/) || s.match(/^(\d{5,})/) || [])[1];
      const hash = id && (s.match(/[?&]h=([0-9a-f]+)/i) || s.match(new RegExp(`(?:^|/)${id}/([0-9a-f]{6,})`, 'i')) || [])[1];
      if (id) return `https://player.vimeo.com/video/${id}?autoplay=1&title=0&byline=0&portrait=0&dnt=1${hash ? `&h=${hash}` : ''}`;
    }
    if (p.youtube) {
      const s = String(p.youtube).trim();
      const id = (s.match(/(?:youtu\.be\/|[?&]v=|\/shorts\/|\/embed\/|\/live\/)([\w-]{11})/) || [])[1] || (/^[\w-]{11}$/.test(s) ? s : '');
      if (id) return `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0&playsinline=1`;
    }
    return '';
  }

  const ICON = {
    play: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 1.8v12.4L14 8z" fill="currentColor"/></svg>',
    pause: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 1.5h3.5v13H3zM9.5 1.5H13v13H9.5z" fill="currentColor"/></svg>',
    sound: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M1.5 5.5h3l4-3.5v12l-4-3.5h-3z" fill="currentColor"/><path d="M11 5a4 4 0 0 1 0 6M12.8 3a7 7 0 0 1 0 10" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>',
    muted: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M1.5 5.5h3l4-3.5v12l-4-3.5h-3z" fill="currentColor"/><path d="M11 5.5l4 5M15 5.5l-4 5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>',
    expand: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M1.5 5.5v-4h4M10.5 1.5h4v4M14.5 10.5v4h-4M5.5 14.5h-4v-4" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>',
    shrink: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M5.5 1.5v4h-4M14.5 5.5h-4v-4M10.5 14.5v-4h4M1.5 10.5h4v4" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>',
    close: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 2.5l11 11M13.5 2.5l-11 11" stroke="currentColor" stroke-width="1.5"/></svg>',
    prev: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M10.5 2L4.5 8l6 6" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>',
    next: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M5.5 2l6 6-6 6" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>',
    out: '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 9.5l7-7M4 2.5h5.5V8" fill="none" stroke="currentColor" stroke-width="1.4"/></svg>',
    copy: '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="5.25" y="5.25" width="8.5" height="8.5" rx="1" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M10.75 5.25v-3h-8.5v8.5h3" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>',
    link: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M6.5 9.5l3-3M7 4.5l1.3-1.3a2.8 2.8 0 0 1 4 4L11 8.5M9 11.5l-1.3 1.3a2.8 2.8 0 0 1-4-4L5 7.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
    theme: '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6.25" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M8 1.75a6.25 6.25 0 0 1 0 12.5z" fill="currentColor"/></svg>',
    rewind: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2.6 9.2A5.5 5.5 0 1 0 4.3 4M2.3 1.6v3.7H6" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>',
  };

  /* ---------- 2. Data ---------- */
  // After Effects label colors: category swatches read like a timeline's label column.
  const LABELS = ['#a9cbc7', '#e5bcc9', '#a9a9ca', '#e7c19e', '#b3c7b3', '#e4d84c', '#a89677', '#3da2a5', '#677de0', '#f46dd6', '#e8920d', '#8e2c9a'];
  const FPS = +SITE.fps || 25;
  // Page ids a project link must never shadow.
  const RESERVED = new Set(['top', 'highlights', 'work', 'about', 'contact', 'main', 'nav', 'menu', 'rail', 'footer', 'viewer', 'grid', 'index', 'marquee', 'showreel']);

  const seen = new Set();
  const PROJECTS = list(DATA.projects).filter((p) => p && p.title && !p.hidden).map((p, i) => {
    const { ratio, aspect } = parseRatio(p.format);
    const wanted = slugify(p.slug || p.title) || `project-${i + 1}`;
    let slug = RESERVED.has(wanted) ? `${wanted}-project` : wanted;
    let n = 2;
    while (seen.has(slug)) slug = `${wanted}-${n++}`;
    if (slug !== wanted) console.warn(`[portfolio] "${p.title}": link name "${wanted}" is taken, using "${slug}". Give it a unique slug in content.js.`);
    seen.add(slug);
    return Object.assign({}, p, {
      n: i + 1,
      slug,
      ratio,
      aspect,
      vertical: aspect < 1,
      client: p.client || '',
      year: p.year ? String(p.year) : '',
      categories: list(p.categories || p.category).map(String),
      tools: list(p.tools),
      fps: +p.fps || FPS,
      seconds: parseDuration(p.duration),
      preview: p.preview || p.video || '',
      embed: embedURL(p),
      description: list(p.description),
      credits: list(p.credits),
      links: list(p.links),
    });
  });
  const BY_SLUG = new Map(PROJECTS.map((p) => [p.slug, p]));

  const CATS = [];
  PROJECTS.forEach((p) => p.categories.forEach((c) => { if (!CATS.includes(c)) CATS.push(c); }));
  const CAT_COLOR = {};
  CATS.forEach((c, i) => { CAT_COLOR[c] = (DATA.categoryColors || {})[c] || LABELS[i % LABELS.length]; });

  const REEL_SRC = HERO.reel || {};
  const isPortrait = () => innerHeight > innerWidth * 1.05;
  const REEL_FPS = +REEL_SRC.fps || FPS;
  /** The muted loop behind the hero. */
  function heroLoop() {
    const v = isPortrait() && REEL_SRC.videoVertical;
    const src = v ? REEL_SRC.videoVertical : REEL_SRC.video;
    if (!src) return null;
    return { src, vertical: !!v, poster: (v && REEL_SRC.posterVertical) || REEL_SRC.poster || '' };
  }
  /** What "Play showreel" opens: the long cut with sound when there is one. */
  function viewerReel() {
    const portrait = isPortrait();
    let video = '';
    let vertical = false;
    if (portrait && REEL_SRC.fullVertical) { video = REEL_SRC.fullVertical; vertical = true; }
    else if (REEL_SRC.full) video = REEL_SRC.full;
    else if (portrait && REEL_SRC.videoVertical) { video = REEL_SRC.videoVertical; vertical = true; }
    else video = REEL_SRC.video;
    if (!video) return null;
    return {
      isReel: true, slug: 'showreel', n: 0,
      title: REEL_SRC.title || 'Showreel',
      client: SITE.name || '', year: REEL_SRC.year ? String(REEL_SRC.year) : '',
      ratio: vertical ? '9:16' : '16:9', aspect: vertical ? 9 / 16 : 16 / 9, vertical,
      fps: REEL_FPS, seconds: parseDuration(vertical ? REEL_SRC.durationVertical : REEL_SRC.duration),
      video, preview: video, embed: '',
      poster: (vertical && REEL_SRC.posterVertical) || REEL_SRC.poster || '',
      summary: REEL_SRC.summary || '', description: list(REEL_SRC.description),
      categories: [], tools: [], credits: [], links: [], role: '',
    };
  }

  const durLabel = (p) => (p.seconds ? clock(p.seconds) : '');
  const totalRuntime = PROJECTS.reduce((a, p) => a + (p.seconds || 0), 0) || 60;
  const baseTitle = `${SITE.name || 'Portfolio'}${SITE.role ? ` — ${SITE.role}` : ''}`;

  /* ---------- 3. Rendering helpers ---------- */
  function mediaHTML(p, { badge = false, reveal = false } = {}) {
    const hasPoster = !!p.poster;
    const img = hasPoster ? `<img src="${esc(p.poster)}" alt="" loading="lazy" decoding="async">` : '';
    const vid = p.preview
      ? (hasPoster
        ? `<video muted loop playsinline preload="none" aria-hidden="true" data-src="${esc(p.preview)}"></video>`
        : `<video muted loop playsinline preload="metadata" aria-hidden="true" src="${esc(p.preview)}#t=0.1"></video>`)
      : '';
    const glyph = `<i class="ratio-glyph ratio-glyph--${p.vertical ? 'v' : 'h'}"></i>`;
    return `<div class="media media--${p.vertical ? 'v' : 'h'}${hasPoster ? '' : ' is-playing'}${reveal ? ' rv rv--clip' : ''}" style="--ar:${p.aspect};${p.color ? `--c:${esc(p.color)};` : ''}">
      <div class="media__inner">${img}${vid}</div>
      <span class="media__progress"></span>
      ${badge ? `<span class="media__badge mono">${glyph}${esc(p.ratio)}</span>` : ''}
    </div>`;
  }

  let toastTimer = 0;
  function toast(msg) {
    const t = $('#toast');
    if (!t) return;
    t.innerHTML = `<i class="kf"></i><span>${esc(msg)}</span>`;
    t.classList.add('is-on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('is-on'), 2600);
  }
  function copyText(text, okMsg) {
    const fallback = () => {
      const ta = document.createElement('textarea');
      ta.value = text; ta.setAttribute('readonly', '');
      ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
      document.body.appendChild(ta); ta.select();
      let ok = false;
      try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
      ta.remove();
      toast(ok ? okMsg : `Select and copy: ${text}`);
    };
    try {
      navigator.clipboard.writeText(text).then(() => toast(okMsg), fallback);
    } catch (e) { fallback(); }
  }

  /* ---------- 4. Frame loop & media ---------- */
  const S = { y: scrollY, sy: scrollY, vy: 0, vw: innerWidth, vh: innerHeight, px: innerWidth / 2, py: innerHeight / 2, mouse: false };
  // Page tickers pause while the viewer covers the page; viewer tickers always run.
  // A ticker returns true while it still has something to animate; the loop sleeps when none do.
  const tickers = [];
  const addTicker = (fn, page = true) => { tickers.push({ fn, page }); wake(); };
  let rafId = 0;
  let lastT = performance.now();
  let lastBusy = 0;
  function wake() {
    lastBusy = performance.now();
    if (!rafId) { lastT = performance.now(); rafId = requestAnimationFrame(frame); }
  }
  function frame(now) {
    rafId = 0;
    const dt = clamp((now - lastT) / 1000, 0.001, 0.05);
    lastT = now;
    const y = scrollY;
    S.vy += ((y - S.y) / dt - S.vy) * Math.min(1, dt * 8);
    S.y = y;
    S.sy += (y - S.sy) * (reduced ? 1 : 1 - Math.exp(-dt * 9));
    if (Math.abs(y - S.sy) < 0.05) S.sy = y;
    let busy = S.sy !== y || Math.abs(S.vy) > 2;
    const pageOn = !Viewer.isOpen || Viewer.closing;
    for (const t of tickers) {
      if (t.page && !pageOn) continue;
      if (safe(t.fn, dt, now)) busy = true;
    }
    if (busy) lastBusy = now;
    if (now - lastBusy < 500) rafId = requestAnimationFrame(frame);
  }
  addEventListener('pointermove', (e) => {
    S.px = e.clientX; S.py = e.clientY; S.mouse = e.pointerType === 'mouse';
    wake();
  }, { passive: true });
  addEventListener('scroll', wake, { passive: true });
  addEventListener('keydown', wake);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) wake(); });

  const Media = {
    attach(v) {
      if (v && !v.getAttribute('src') && v.dataset.src) v.src = v.dataset.src;
    },
    play(v, restart) {
      if (!v) return;
      // While a project is up (from the click, through the transition, until closed), only the viewer plays.
      if (Viewer.current && !v.closest('#viewer')) return;
      this.attach(v);
      v.muted = true;
      if (restart && v.readyState > 0) { try { v.currentTime = 0; } catch (e) { /* not seekable yet */ } }
      const pr = v.play();
      if (pr && pr.catch) pr.catch(() => {});
    },
    pause(v) { if (v && !v.paused) v.pause(); },
    /** Drop a paused preview's buffer; the poster stays. */
    release(v) {
      if (!v || !v.paused || !v.dataset.src || !v.getAttribute('src')) return;
      v.removeAttribute('src');
      try { v.load(); } catch (e) { /* ignore */ }
      const m = v.closest('.media');
      if (m) m.classList.remove('is-playing');
    },
  };
  // Media events don't bubble; listen in the capture phase to flag wrappers.
  document.addEventListener('playing', (e) => {
    const m = e.target.closest && e.target.closest('.media, .hero__media');
    if (m) m.classList.add('is-playing');
    wake();
  }, true);
  document.addEventListener('pause', (e) => {
    const m = e.target.closest && e.target.closest('.media');
    if (m && m.querySelector('img')) m.classList.remove('is-playing');
  }, true);
  document.addEventListener('error', (e) => {
    const t = e.target;
    if (t && t.tagName === 'IMG' && t.closest('.media, .hero__media')) t.classList.add('is-broken');
  }, true);
  document.addEventListener('visibilitychange', () => {
    $$('video').forEach((v) => {
      if (!v.muted) return; // the viewer keeps playing with sound, like any player
      if (document.hidden) { if (!v.paused) { v._resume = true; v.pause(); } }
      else if (v._resume) { v._resume = false; if (autoplayOK()) Media.play(v); }
    });
  });

  // Autoplay muted loops while at least a third of them is on screen.
  const autoIO = 'IntersectionObserver' in window ? new IntersectionObserver((entries) => {
    entries.forEach((en) => {
      const v = en.target.querySelector('video');
      if (!v) return;
      en.target._inView = en.isIntersecting;
      if (en.isIntersecting && autoplayOK() && !Viewer.isOpen) Media.play(v);
      else if (!en.isIntersecting) Media.pause(v);
    });
  }, { threshold: 0.35 }) : null;
  const autoplayWhenVisible = (el) => { if (autoIO && el) autoIO.observe(el); };

  /** Pause or resume everything that moves on its own. */
  function setStill(on, save = true) {
    still = on;
    if (save) store.set('bg-still', on ? '1' : '0');
    root.classList.toggle('is-still', on);
    $$('[data-motion]').forEach((b) => {
      b.setAttribute('aria-pressed', String(on));
      b.title = on ? 'Motion paused: click to play' : 'Pause motion';
    });
    if (on) {
      $$('#main video').forEach((v) => Media.pause(v));
    } else if (autoplayOK()) {
      const hv = $('.hero__media video');
      if (hv && $('#top')._visible) Media.play(hv);
      $$('.hl__link .media').forEach((m) => { if (m._inView) Media.play($('video', m)); });
    }
    wake();
  }

  /* ---------- 5. Nav + hero ---------- */
  function renderNav() {
    const nav = $('#nav');
    const links = [['work', 'Work', PROJECTS.length], ['about', 'About'], ['contact', 'Contact']];
    const status = SITE.availability
      ? `<p class="status mono${SITE.available === false ? ' status--off' : ''}"><i class="status__dot"></i>${esc(SITE.availability)}</p>` : '';
    nav.innerHTML = `
      <div class="nav__inner">
        <a class="brand" href="#top" aria-label="${esc(SITE.name || 'Home')}, back to top">
          <span class="brand__mark">${esc(SITE.name || 'Portfolio')}</span>
          <span class="brand__role mono">${esc(SITE.role || '')}</span>
        </a>
        <nav class="nav__links mono" aria-label="Sections">
          ${links.map(([id, label, n]) => `<a class="nav__link" href="#${id}" data-section="${id}">${label}${n ? `<sup>${pad(n)}</sup>` : ''}</a>`).join('')}
        </nav>
        ${status}
        <button class="icon-btn" id="theme-toggle" type="button" aria-label="Switch theme">${ICON.theme}</button>
        <button class="menu-btn mono" type="button" aria-expanded="false" aria-controls="menu">Menu</button>
      </div>`;

    const menu = $('#menu');
    menu.innerHTML = `
      <button class="menu-btn mono menu__close" type="button" style="display:inline-flex">Close</button>
      <div class="menu__links">
        ${links.map(([id, label]) => `<a href="#${id}">${label}</a>`).join('')}
      </div>
      <div class="menu__foot">
        ${status}
        ${SITE.email ? `<p class="mono">${esc(SITE.email)}</p>` : ''}
        <ul class="mono">${list(SITE.socials).map((s) => `<li><a class="link-arrow" href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.label)} ${ICON.out}</a></li>`).join('')}</ul>
      </div>`;
    menu.inert = true;
    const openBtn = $('.nav .menu-btn');
    const behind = ['#main', '#footer', '#rail', '.skip', '.nav__inner'];
    const setMenu = (open) => {
      menu.classList.toggle('is-open', open);
      menu.inert = !open;
      behind.forEach((s) => { const n = $(s); if (n) n.inert = open; });
      openBtn.setAttribute('aria-expanded', String(open));
      root.classList.toggle('is-locked', open);
      if (open) $('.menu__close', menu).focus();
      else openBtn.focus({ preventScroll: true });
    };
    openBtn.addEventListener('click', () => setMenu(true));
    $('.menu__close', menu).addEventListener('click', () => setMenu(false));
    menu.addEventListener('click', (e) => { if (e.target.closest('a[href^="#"]')) setMenu(false); });
    addEventListener('keydown', (e) => { if (e.key === 'Escape' && menu.classList.contains('is-open')) setMenu(false); });
  }

  function initNavBehavior() {
    const nav = $('#nav');
    const hero = $('#top');
    let lastY = scrollY;
    const update = () => {
      const y = scrollY;
      const heroEnd = hero.offsetHeight - 80;
      nav.classList.toggle('is-over-media', y < heroEnd);
      nav.classList.toggle('is-solid', y >= heroEnd);
      if (y > lastY + 6 && y > 240) nav.classList.add('is-hidden');
      else if (y < lastY - 6 || y < 240) {
        // On phones the stuck filter bar already takes the top: don't stack the nav on it.
        const ctl = $('.work__controls');
        const work = $('#work');
        const inGrid = mqPhone.matches && ctl && work && y >= 240
          && ctl.getBoundingClientRect().top <= 1 && work.getBoundingClientRect().bottom > nav.offsetHeight + ctl.offsetHeight;
        if (!inGrid) nav.classList.remove('is-hidden');
      }
      lastY = y;
    };
    addEventListener('scroll', update, { passive: true });
    update();
  }

  /**
   * Variable-font kinetic type. Each letter's width/weight axes react to the
   * pointer (or an idle wave). Widths are normalised so letters trade width,
   * and a per-line correction keeps every line inside its container.
   */
  class Kinetic {
    constructor(host, lines, opts = {}) {
      this.o = Object.assign({ w: 100, wMin: 50, wMax: 150, amp: 70, wg: 800, wgMin: 250, wgAmp: 110, radius: 0.15, maxH: Infinity, fill: 0.96 }, opts);
      this.host = host;
      host.innerHTML = lines.map((l) => `<span class="k-line">${Array.from(String(l)).map((ch) => (ch === ' ' ? '<span class="k-sp"></span>' : `<span class="k-ch">${esc(ch)}</span>`)).join('')}</span>`).join('');
      this.lines = $$('.k-line', host).map((el) => ({ el, corr: 0, first: null, last: null }));
      this.chars = [];
      this.lines.forEach((L, li) => {
        const cs = $$('.k-ch', L.el);
        L.first = cs[0] || null;
        L.last = cs[cs.length - 1] || null;
        cs.forEach((el) => this.chars.push({ el, li, x: 0, y: 0, w: this.o.wMin, g: this.o.wgMin, lw: -1, lg: -1, a: -1, ty: -1 }));
      });
      this.chars.forEach((c) => { c.el.style.opacity = '0'; });
      this.born = null;
      this.hover = 0;
      this.squeeze = 0;
      this.visible = true;
      this.avail = 0;
      this.introDone = false;
    }
    start(delay = 0) { if (this.born === null) { this.born = performance.now() + delay * 1000; wake(); } }
    setBase() {
      const v = `"wdth" ${this.o.w}, "wght" ${this.o.wg}`;
      this.chars.forEach((c) => { c.el.style.fontVariationSettings = v; c.lw = -1; c.lg = -1; });
    }
    fit() {
      const host = this.host;
      // The heading's own width: never the letters' animated width.
      const avail = host.parentElement.clientWidth;
      if (!avail) return;
      this.avail = avail;
      this.setBase();
      host.style.fontSize = '100px';
      this.lines.forEach((L) => { L.el.style.width = 'max-content'; L.corr = 0; });
      const widest = Math.max(...this.lines.map((L) => L.el.offsetWidth)) || 1;
      this.lines.forEach((L) => { L.el.style.width = ''; });
      let fs = (100 * avail) / widest * this.o.fill;
      fs = Math.min(fs, this.o.maxH / (this.lines.length * 0.8 + 0.05));
      host.style.fontSize = `${Math.max(24, fs).toFixed(1)}px`;
      this.measure();
      wake();
    }
    measure() {
      const r = this.host.getBoundingClientRect();
      this.chars.forEach((c) => {
        const b = c.el.getBoundingClientRect();
        c.x = b.left + b.width / 2 - r.left;
        c.y = b.top + b.height / 2 - r.top;
      });
    }
    /** Returns true while anything is still moving. */
    update(dt, now) {
      if (this.born === null || !this.visible || now < this.born) return this.born !== null && this.visible;
      const o = this.o;
      const n = this.chars.length;
      if (!n) return false;
      const t = (now - this.born) / 1000;
      const r = this.host.getBoundingClientRect();
      const over = S.mouse && S.px >= r.left - 40 && S.px <= r.right + 40 && S.py >= r.top - 80 && S.py <= r.bottom + 80;
      const hoverTarget = over && !reduced ? 1 : 0;
      this.hover += (hoverTarget - this.hover) * Math.min(1, dt * 3);
      if (Math.abs(hoverTarget - this.hover) < 0.002) this.hover = hoverTarget;
      const idleOn = ambientOK();
      const base = o.w + (58 - o.w) * this.squeeze;
      const W = r.width || 1;
      const f = new Array(n);
      let mean = 0;
      for (let k = 0; k < n; k++) {
        const c = this.chars[k];
        let v = 0;
        if (!reduced) {
          const idle = idleOn ? 0.5 + 0.5 * Math.sin(t * 1.25 - k * 0.6) : 0.5;
          let fp = 0;
          if (this.hover > 0.001) {
            const dx = (S.px - r.left - c.x) / W;
            const dy = (S.py - r.top - c.y) / W;
            fp = Math.exp(-(dx * dx + dy * dy * 0.5) / (o.radius * o.radius));
          }
          v = idle * 0.4 * (1 - this.hover) + fp * this.hover;
        }
        f[k] = v; mean += v;
      }
      mean /= n;
      const follow = 1 - Math.exp(-dt * 9);
      let changed = false;
      let introRunning = false;
      for (let k = 0; k < n; k++) {
        const c = this.chars[k];
        const intro = reduced ? 1 : easeOutExpo(clamp((t - k * 0.045) / 1.2, 0, 1));
        if (intro < 1) introRunning = true;
        const tw = clamp(base + o.amp * (f[k] - mean) + this.lines[c.li].corr, o.wMin, o.wMax);
        const tg = clamp(o.wg + o.wgAmp * (f[k] - mean) * 2, 100, 900);
        const w = o.wMin + (tw - o.wMin) * intro;
        const g = o.wgMin + (tg - o.wgMin) * intro;
        const k0 = intro < 1 ? 1 : follow;
        c.w += (w - c.w) * k0;
        c.g += (g - c.g) * k0;
        // Quantised axes let the browser reuse font instances instead of building one per frame.
        const qw = Math.round(c.w);
        const qg = Math.round(c.g / 10) * 10;
        if (qw !== c.lw || qg !== c.lg) {
          c.el.style.fontVariationSettings = `"wdth" ${qw}, "wght" ${qg}`;
          c.lw = qw; c.lg = qg;
          changed = true;
        }
        const a = clamp(intro * 3, 0, 1);
        const ty = intro < 1 ? Math.round((1 - intro) * 350) / 1000 : 0;
        if (a !== c.a || ty !== c.ty) {
          c.el.style.opacity = a >= 1 ? '' : a.toFixed(3);
          c.el.style.transform = ty ? `translateY(${ty}em)` : '';
          c.a = a; c.ty = ty;
        }
      }
      // Keep every line inside the heading: shrink fast when a line spills, relax slowly.
      if (changed && this.avail) {
        const limit = this.avail * 0.995;
        this.lines.forEach((L) => {
          if (!L.first) return;
          const w = L.last.getBoundingClientRect().right - L.first.getBoundingClientRect().left;
          const overBy = (w - limit) / this.avail;
          L.corr = clamp(L.corr - overBy * (overBy > 0 ? 160 : 40), -45, 0);
        });
      }
      return changed || introRunning || (idleOn && !reduced) || (this.hover > 0 && this.hover < 1);
    }
  }

  let heroKinetic = null;
  function renderHero() {
    const hero = $('#top');
    const loop = heroLoop();
    const reel = viewerReel();
    const lines = list(HERO.title).length ? list(HERO.title) : [SITE.name || 'Motion', SITE.role || 'Design'];
    const reelLabel = `${REEL_SRC.title || 'Showreel'}${REEL_SRC.year ? ` ${REEL_SRC.year}` : ''}`;
    hero.innerHTML = `
      <div class="hero__media">
        ${loop && loop.poster ? `<img src="${esc(loop.poster)}" alt="" fetchpriority="high">` : ''}
        ${loop ? '<video muted loop playsinline preload="auto" aria-hidden="true"></video>' : ''}
      </div>
      <div class="hero__scrim"></div>
      <div class="hero__frame" aria-hidden="true">
        <i class="crop crop--tl"></i><i class="crop crop--tr"></i><i class="crop crop--bl"></i><i class="crop crop--br"></i><i class="crosshair"></i>
      </div>
      <div class="hero__hud mono" aria-hidden="true">
        <span class="hud__rec"><i class="kf"></i>${esc(loop ? reelLabel : SITE.role || '')}</span>
        <span class="hud__fmt">${loop ? `${loop.vertical ? '9:16' : '16:9'} · ` : ''}${REEL_FPS} fps</span>
        <span class="hud__tc">TC <span data-hero-tc>${timecode(0, REEL_FPS)}</span></span>
      </div>
      <div class="hero__content">
        <h1 class="hero__title"><span class="vh">${esc(lines.join(' '))}</span><span class="k" aria-hidden="true"></span></h1>
        <div class="hero__foot">
          ${HERO.intro ? `<p class="hero__intro">${esc(HERO.intro)}</p>` : ''}
          <div class="hero__actions">
            ${reel ? `<button class="btn btn--media" type="button" data-open-reel data-cursor="Watch" data-cursor-meta="with sound"><span class="btn__icon">${ICON.play}</span>Play showreel<span class="btn__meta" data-reel-len>${reel.seconds ? clock(reel.seconds) : ''}</span></button>` : ''}
            <a class="scroll-cue mono" href="#${PROJECTS.length ? 'highlights' : 'about'}"><span class="scroll-cue__line"></span>Scroll</a>
          </div>
        </div>
      </div>`;
    heroKinetic = new Kinetic($('.hero__title .k', hero), lines, { w: 104 });
  }

  function initHero() {
    const hero = $('#top');
    const media = $('.hero__media', hero);
    const video = $('video', media);
    const tcEl = $('[data-hero-tc]', hero);
    const title = $('.hero__title', hero);
    const content = $('.hero__content', hero);
    const lenEl = $('[data-reel-len]', hero);
    let portrait = isPortrait();
    hero._visible = true;

    const setSource = () => {
      const loop = heroLoop();
      if (!video || !loop) return;
      const img = $('img', media);
      if (img && loop.poster && img.getAttribute('src') !== loop.poster) { img.classList.remove('is-broken'); img.src = loop.poster; }
      // Only fetch the loop when it may actually play (not for reduced motion, Save-Data or paused motion).
      if (video.dataset.src !== loop.src) {
        video.dataset.src = loop.src;
        if (video.getAttribute('src')) { video.removeAttribute('src'); try { video.load(); } catch (e) { /* ignore */ } }
      }
      if (autoplayOK() && hero._visible) Media.play(video);
      if (lenEl) { const r = viewerReel(); lenEl.textContent = r && r.seconds ? clock(r.seconds) : ''; }
    };
    if (video) setSource();
    if ('IntersectionObserver' in window) {
      // -1px keeps "resting exactly on the hero's bottom edge" from counting as visible.
      new IntersectionObserver(([en]) => {
        hero._visible = en.isIntersecting;
        heroKinetic.visible = en.isIntersecting;
        if (video) { if (en.isIntersecting && autoplayOK()) Media.play(video); else Media.pause(video); }
        wake();
      }, { rootMargin: '-1px 0px 0px 0px' }).observe(hero);
    }

    const fit = () => {
      const heroTop = hero.getBoundingClientRect().top;
      const hud = $('.hero__hud', hero);
      const nav = $('#nav');
      const hudOn = hud && getComputedStyle(hud).display !== 'none';
      const topClear = hudOn ? hud.getBoundingClientRect().bottom - heroTop + 28 : (nav ? nav.offsetHeight : 64) + 16;
      const cs = getComputedStyle(content);
      const below = content.querySelector('.hero__foot').offsetHeight + parseFloat(cs.paddingBottom) + parseFloat(cs.rowGap || 0);
      heroKinetic.o.maxH = Math.max(48, (hero.clientHeight - topClear - below) * 0.97);
      heroKinetic.fit();
    };
    fit();
    onFontsReady(fit);
    heroKinetic.start(0.15);

    onResize(() => {
      fit();
      if (isPortrait() !== portrait) { portrait = isPortrait(); setSource(); }
    });

    addTicker((dt, now) => {
      const h = hero.offsetHeight || 1;
      const p = clamp(S.sy / h, 0, 1);
      if (p < 1) {
        if (!reduced) {
          media.style.transform = `translate3d(0, ${(p * h * 0.28).toFixed(1)}px, 0) scale(${(1 + p * 0.08).toFixed(4)})`;
          title.style.transform = `translate3d(0, ${(-p * h * 0.1).toFixed(1)}px, 0)`;
        }
        heroKinetic.squeeze = reduced ? 0 : p;
      }
      const moving = heroKinetic.update(dt, now);
      const playing = video && !video.paused && hero._visible;
      if (playing && tcEl) tcEl.textContent = timecode(video.currentTime, REEL_FPS);
      return moving || playing;
    });
  }

  /* ---------- 6. Highlights ---------- */
  const HL = { pinned: false, dist: 0, top: 0, x: 0, n: 0 };
  function renderHighlights() {
    const sec = $('#highlights');
    const hlSlug = (s) => { const w = slugify(s); return BY_SLUG.has(w) ? w : `${w}-project`; };
    const bySlugs = list(DATA.highlights).map((s) => BY_SLUG.get(hlSlug(s))).filter(Boolean);
    const items = bySlugs.length ? bySlugs : PROJECTS.filter((p) => p.featured);
    const shown = items.length ? items : PROJECTS.slice(0, 4);
    if (!shown.length) { sec.hidden = true; return; }
    HL.n = shown.length;
    sec.innerHTML = `
      <div class="hl__sticky">
        <div class="section-head">
          <h2 class="section-title section-title--md" id="hl-title">Selected work</h2>
          <div class="hl__meta" aria-hidden="true">
            <p class="hl__count"><b data-hl-current>01</b><span>/${pad(shown.length)}</span></p>
            <div class="hl__bar"><i></i></div>
          </div>
        </div>
        <div class="hl__track">
          ${shown.map((p, i) => `
            <article class="hl__item hl__item--${p.vertical ? 'v' : 'h'}" style="--ar:${p.aspect};--hs:${p.aspect > 1 ? 0.8 : 1}">
              <a class="hl__link" href="#${p.slug}" data-open="${p.slug}" data-cursor="Play" data-cursor-meta="${esc(durLabel(p))}" tabindex="-1" aria-hidden="true">
                ${mediaHTML(p, { badge: true })}
              </a>
              <div class="hl__info">
                <span class="hl__idx mono">${pad(i + 1)}/${pad(shown.length)}</span>
                <h3 class="hl__title"><a href="#${p.slug}" data-open="${p.slug}">${esc(p.title)}</a></h3>
                <p class="hl__sub mono">${[p.client, p.year, p.categories.join(' / ')].filter(Boolean).map((x) => `<span>${esc(x)}</span>`).join('')}</p>
              </div>
            </article>`).join('')}
          <div class="hl__end">
            <p class="eyebrow mono">Archive</p>
            <p class="hl__end-title">${PROJECTS.length} projects, ${PROJECTS.filter((p) => p.vertical).length} of them vertical</p>
            <a class="btn btn--ghost" href="#work">Browse all work</a>
          </div>
        </div>
      </div>`;
    $$('.hl__link .media', sec).forEach(autoplayWhenVisible);
  }

  function initHighlights() {
    const sec = $('#highlights');
    if (sec.hidden) return;
    const sticky = $('.hl__sticky', sec);
    const track = $('.hl__track', sec);
    const bar = $('.hl__bar', sec);
    const cur = $('[data-hl-current]', sec);
    const items = $$('.hl__item', track);
    let lastIdx = -1;
    let lastProg = -1;

    const measure = () => {
      sec.classList.add('is-pinned');
      const stickyH = sticky.offsetHeight;
      HL.pinned = S.vw >= 900 && stickyH >= 560 && !reduced;
      sec.classList.toggle('is-pinned', HL.pinned);
      if (HL.pinned) {
        track.style.transform = 'none';
        const last = track.lastElementChild;
        const padR = parseFloat(getComputedStyle(track).paddingRight) || 0;
        HL.dist = Math.max(0, last.offsetLeft + last.offsetWidth + padR - sticky.clientWidth);
        // Height comes from the sticky frame itself (svh), so URL-bar changes can't desync it.
        sec.style.height = `${Math.round(stickyH + HL.dist)}px`;
        HL.top = sec.getBoundingClientRect().top + scrollY;
        track.style.transform = `translate3d(${HL.x}px,0,0)`;
      } else {
        sec.style.height = '';
        track.style.transform = '';
      }
      requestRailMeasure();
      wake();
    };
    measure();
    onResize(measure);
    onFontsReady(measure);
    if ('ResizeObserver' in window) {
      let h = sticky.offsetHeight;
      new ResizeObserver(() => { if (Math.abs(sticky.offsetHeight - h) > 1) { h = sticky.offsetHeight; measure(); } }).observe(sticky);
    }

    // Keyboard users: tabbing to an item scrolls the page so the reel brings it into view.
    track.addEventListener('focusin', (e) => {
      if (!HL.pinned) return;
      const item = e.target.closest('.hl__item, .hl__end');
      if (!item) return;
      const padL = parseFloat(getComputedStyle(track).paddingLeft) || 0;
      const x = clamp(item.offsetLeft - padL, 0, HL.dist);
      scrollTo({ top: HL.top + x, behavior: 'instant' });
      HL.x = -x;
    });
    track.addEventListener('scroll', wake, { passive: true });

    addTicker((dt) => {
      let prog;
      let moving = false;
      let idx;
      if (HL.pinned) {
        if (S.y + S.vh < HL.top - 200 || S.y > HL.top + HL.dist + S.vh + 200) {
          // Off screen: park the track at the matching end without animating.
          HL.x = S.y < HL.top ? 0 : -HL.dist;
        } else {
          const target = -clamp((S.y - HL.top) / (HL.dist || 1), 0, 1) * HL.dist;
          HL.x += (target - HL.x) * (1 - Math.exp(-dt * 7));
          if (Math.abs(target - HL.x) < 0.1) HL.x = target; else moving = true;
        }
        track.style.transform = `translate3d(${HL.x.toFixed(2)}px,0,0)`;
        prog = HL.dist ? -HL.x / HL.dist : 0;
        idx = Math.round(prog * (HL.n - 1));
      } else {
        const max = track.scrollWidth - track.clientWidth;
        prog = max > 0 ? track.scrollLeft / max : 0;
        // Swipe mode: the current item is the last one whose start has been reached.
        const x0 = items[0].offsetLeft;
        idx = 0;
        items.forEach((it, i) => { if (it.offsetLeft - x0 <= track.scrollLeft + 2) idx = i; });
        if (prog > 0.995) idx = HL.n - 1;
      }
      if (Math.abs(prog - lastProg) > 0.0005) { bar.style.setProperty('--p', prog.toFixed(4)); lastProg = prog; }
      if (idx !== lastIdx) { cur.textContent = pad(idx + 1); lastIdx = idx; }
      return moving;
    });
  }

  /* ---------- Marquee ---------- */
  function initMarquee() {
    const el = $('#marquee');
    const words = list(DATA.marquee).length ? list(DATA.marquee) : list(ABOUT.services);
    if (!words.length) { el.hidden = true; return; }
    const group = `<div class="marquee__group">${words.map((w) => `<span class="marquee__item">${esc(w)}</span><i class="kf"></i>`).join('')}</div>`;
    el.innerHTML = `<div class="marquee__track">${group}${group}</div>`;
    const track = $('.marquee__track', el);
    let gw = 0;
    let x = 0;
    let dir = 1;
    let visible = false;
    const measure = () => {
      const g = $('.marquee__group', track);
      gw = g.offsetWidth;
      const need = Math.ceil(S.vw / (gw || 1)) + 1;
      while (track.children.length < need + 1) track.insertAdjacentHTML('beforeend', group);
    };
    measure();
    onResize(measure);
    onFontsReady(measure);
    if ('IntersectionObserver' in window) new IntersectionObserver(([en]) => { visible = en.isIntersecting; wake(); }).observe(el);
    addTicker((dt) => {
      if (!visible || !ambientOK() || !gw) return false;
      if (Math.abs(S.vy) > 60) dir = S.vy > 0 ? 1 : -1;
      x -= (48 + Math.min(Math.abs(S.vy) * 0.25, 900)) * dir * dt;
      if (x <= -gw) x += gw;
      if (x > 0) x -= gw;
      track.style.transform = `translate3d(${x.toFixed(2)}px,0,0)`;
      return true;
    });
  }

  /* ---------- 7. Work: filters, masonry grid, index ---------- */
  const W = { cat: '*', fmt: '*', view: 'grid', sort: null, dir: 1, tiles: [], gridTop: 0 };
  const matches = (p) => (W.cat === '*' || p.categories.includes(W.cat)) && (W.fmt === '*' || (W.fmt === 'v') === p.vertical);
  const filtered = () => PROJECTS.filter(matches);

  function renderWork() {
    const sec = $('#work');
    if (!PROJECTS.length) { sec.hidden = true; return; }
    const hasV = PROJECTS.some((p) => p.vertical);
    const hasH = PROJECTS.some((p) => !p.vertical);
    const onlyRatio = (v) => { const r = new Set(PROJECTS.filter((p) => p.vertical === v).map((p) => p.ratio)); return r.size === 1 ? [...r][0] : null; };
    const hLabel = onlyRatio(false) || 'Landscape';
    const vLabel = onlyRatio(true) || 'Portrait';
    const count = (c) => PROJECTS.filter((p) => p.categories.includes(c)).length;
    const sortBtn = (key, label) => `<button type="button" data-sort="${key}" data-label="${label}" aria-label="Sort by ${label.toLowerCase()}">${label}</button>`;
    sec.innerHTML = `
      <div class="section-head">
        <h2 class="section-title rv" id="work-title">All work<sup>(${pad(PROJECTS.length)})</sup></h2>
      </div>
      <div class="work__controls">
        <div class="chips mono" role="group" aria-label="Filter by discipline">
          <button class="chip" type="button" data-cat="*" aria-pressed="true">All<sup>${PROJECTS.length}</sup></button>
          ${CATS.map((c) => `<button class="chip" type="button" data-cat="${esc(c)}" aria-pressed="false"><i class="swatch" style="--sw:${CAT_COLOR[c]}"></i>${esc(c)}<sup>${count(c)}</sup></button>`).join('')}
        </div>
        <div class="work__tools">
          ${hasV && hasH ? `<div class="seg mono" role="group" aria-label="Filter by format">
            <button type="button" data-fmt="*" aria-pressed="true"><i class="ratio-glyph ratio-glyph--all"></i>All</button>
            <button type="button" data-fmt="h" aria-pressed="false"><i class="ratio-glyph ratio-glyph--h"></i>${esc(hLabel)}</button>
            <button type="button" data-fmt="v" aria-pressed="false"><i class="ratio-glyph ratio-glyph--v"></i>${esc(vLabel)}</button>
          </div>` : ''}
          <div class="seg mono" role="group" aria-label="Layout">
            <button type="button" data-view="grid" aria-pressed="true">Grid</button>
            <button type="button" data-view="index" aria-pressed="false">Index</button>
          </div>
        </div>
      </div>
      <p class="vh" id="work-status" role="status" aria-live="polite"></p>
      <div class="grid" id="grid">
        ${PROJECTS.map((p) => `
          <a class="tile" href="#${p.slug}" data-open="${p.slug}" data-slug="${p.slug}" data-cursor="Play" data-cursor-meta="${esc(durLabel(p))}">
            ${mediaHTML(p, { badge: true, reveal: true })}
            <div class="tile__meta rv" style="--d:.08s">
              <h3 class="tile__title">${esc(p.title)}</h3>
              <span class="tile__dur mono">${esc(durLabel(p))}</span>
              <p class="tile__sub mono">${[p.client, p.year].filter(Boolean).map((x) => `<span>${esc(x)}</span>`).join('')}</p>
            </div>
          </a>`).join('')}
      </div>
      <div class="index" id="index" hidden>
        <div class="index__head mono">
          <span>No.</span>
          ${sortBtn('title', 'Project')}
          ${sortBtn('client', 'Client')}
          <span>Discipline</span>
          <span class="index__col-fmt">Format</span>
          ${sortBtn('year', 'Year')}
          ${sortBtn('seconds', 'Length')}
        </div>
        ${PROJECTS.map((p) => `
          <a class="index__row" href="#${p.slug}" data-open="${p.slug}" data-slug="${p.slug}">
            <span class="index__thumb">${mediaHTML(p)}</span>
            <span class="index__num mono">${pad(p.n)}</span>
            <span class="index__title">${esc(p.title)}</span>
            <span class="index__cell index__col-client">${esc(p.client)}</span>
            <span class="index__cats index__col-cats mono">${p.categories.map((c) => `<span><i class="swatch" style="--sw:${CAT_COLOR[c]}"></i>${esc(c)}</span>`).join('')}</span>
            <span class="index__fmt index__col-fmt mono"><i class="ratio-glyph ratio-glyph--${p.vertical ? 'v' : 'h'}"></i>${esc(p.ratio)}</span>
            <span class="mono index__col-year">${esc(p.year)}</span>
            <span class="mono index__col-dur">${esc(durLabel(p))}</span>
          </a>`).join('')}
      </div>
      <div class="work__empty" hidden><p>No projects match both filters.</p><button class="btn btn--ghost" type="button" data-reset>Show all work</button></div>`;
  }

  /**
   * Masonry with look-ahead: wide clips span two columns, and each placement is
   * scored by its own gap plus the smallest gap it forces on what comes next,
   * so nearby tall clips fill the holes instead of leaving them.
   */
  function layoutGrid(animate) {
    const grid = $('#grid');
    if (!grid || W.view !== 'grid') return;
    const width = grid.clientWidth;
    if (!width) return;
    const cols = width >= 1100 ? 4 : width >= 700 ? 3 : 2;
    const gap = parseFloat(getComputedStyle(grid).columnGap) || 16;
    const colW = (width - gap * (cols - 1)) / cols;
    const items = W.tiles.filter((t) => matches(t.p));

    grid.classList.toggle('is-animated', !!animate && !reduced);
    items.forEach((t) => {
      t.span = Math.min(cols, t.p.aspect > 1.2 ? 2 : 1);
      t.el.style.width = `${colW * t.span + gap * (t.span - 1)}px`;
    });
    items.forEach((t) => { t.h = t.el.offsetHeight; });

    const heights = new Array(cols).fill(0);
    const bestPos = (span, hs) => {
      let best = null;
      for (let c = 0; c + span <= cols; c++) {
        const slice = hs.slice(c, c + span);
        const y = Math.max(...slice);
        const waste = slice.reduce((a, h) => a + (y - h), 0);
        if (!best || y < best.y - 0.5 || (Math.abs(y - best.y) <= 0.5 && waste < best.waste)) best = { c, y, waste };
      }
      return best;
    };
    const queue = items.slice();
    let order = 0;
    while (queue.length) {
      let pick = null;
      const win = Math.min(4, queue.length);
      for (let k = 0; k < win; k++) {
        const it = queue[k];
        const pos = bestPos(it.span, heights);
        // Look one step ahead: what gap does this choice force on whatever goes next?
        const hs = heights.slice();
        for (let j = pos.c; j < pos.c + it.span; j++) hs[j] = pos.y + it.h + gap;
        let next = 0;
        let first = true;
        for (let j = 0; j < win; j++) {
          if (j === k) continue;
          const w = bestPos(queue[j].span, hs).waste + (j - (j > k ? 1 : 0)) * colW * 0.35;
          if (first || w < next) next = w;
          first = false;
        }
        const score = pos.waste + next + k * colW * 0.35;
        if (!pick || score < pick.score) pick = { k, pos, score };
      }
      const t = queue.splice(pick.k, 1)[0];
      t.x = pick.pos.c * (colW + gap);
      t.y = pick.pos.y;
      for (let j = pick.pos.c; j < pick.pos.c + t.span; j++) heights[j] = t.y + t.h + gap;
      t.el.style.setProperty('--x', `${t.x.toFixed(1)}px`);
      t.el.style.setProperty('--y', `${t.y.toFixed(1)}px`);
      t.el.style.setProperty('--delay', `${(order++ % 8) * 0.04}s`);
      t.mh = t.el.querySelector('.media').offsetHeight;
    }
    grid.style.height = `${Math.max(0, Math.max(...heights) - gap)}px`;
    W.gridTop = grid.getBoundingClientRect().top + scrollY;
    W.parDirty = true;
    wake();
  }

  function applyFilters(animate = true) {
    const shown = filtered();
    $$('.chip', $('#work')).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.cat === W.cat)));
    $$('[data-fmt]', $('#work')).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.fmt === W.fmt)));
    // Counts follow the format filter, so each chip says what it will show.
    $$('.chip', $('#work')).forEach((b) => {
      const c = b.dataset.cat;
      const n = PROJECTS.filter((p) => (c === '*' || p.categories.includes(c)) && (W.fmt === '*' || (W.fmt === 'v') === p.vertical)).length;
      const sup = $('sup', b);
      if (sup) sup.textContent = n;
    });

    W.tiles.forEach((t) => {
      const on = matches(t.p);
      const wasOut = t.el.classList.contains('is-out');
      if (on && wasOut) t.entering = true;
      if (!on) t.el.classList.add('is-out');
    });
    // Tiles coming back appear in place instead of flying in from their old spot.
    W.tiles.filter((t) => t.entering).forEach((t) => t.el.classList.add('no-trans'));
    W.tiles.filter((t) => t.entering).forEach((t) => t.el.classList.remove('is-out'));
    layoutGrid(animate);
    W.tiles.filter((t) => t.entering).forEach((t) => {
      t.el.style.opacity = '0';
      void t.el.offsetWidth;
      t.el.classList.remove('no-trans');
      t.el.style.opacity = '';
      t.entering = false;
    });

    $$('.index__row', $('#index')).forEach((row) => { row.hidden = !matches(BY_SLUG.get(row.dataset.slug)); });
    const empty = $('.work__empty', $('#work'));
    empty.hidden = shown.length > 0;
    const st = $('#work-status');
    if (st) st.textContent = `Showing ${shown.length} of ${PROJECTS.length} projects`;
    requestRailMeasure();
  }

  function setView(view, save = true) {
    W.view = view === 'index' ? 'index' : 'grid';
    $$('[data-view]', $('#work')).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.view === W.view)));
    $('#grid').hidden = W.view !== 'grid';
    $('#index').hidden = W.view !== 'index';
    if (save) store.set('bg-view', W.view);
    if (W.view === 'grid') layoutGrid(false);
    requestRailMeasure();
  }

  function sortIndex(key) {
    if (W.sort === key) W.dir *= -1; else { W.sort = key; W.dir = key === 'year' || key === 'seconds' ? -1 : 1; }
    const idx = $('#index');
    $$('[data-sort]', idx).forEach((b) => {
      const label = b.dataset.label;
      if (b.dataset.sort === W.sort) {
        const dir = W.dir > 0 ? 'ascending' : 'descending';
        b.dataset.dir = dir;
        b.setAttribute('aria-label', `${label}, sorted ${dir}`);
      } else {
        delete b.dataset.dir;
        b.setAttribute('aria-label', `Sort by ${label.toLowerCase()}`);
      }
    });
    const rows = $$('.index__row', idx);
    rows.sort((a, b) => {
      const pa = BY_SLUG.get(a.dataset.slug);
      const pb = BY_SLUG.get(b.dataset.slug);
      const va = pa[key];
      const vb = pb[key];
      const cmp = typeof va === 'number' ? va - vb : String(va).localeCompare(String(vb), undefined, { numeric: true });
      return (cmp || pa.n - pb.n) * W.dir;
    });
    rows.forEach((r) => idx.appendChild(r));
  }

  function initWork() {
    const sec = $('#work');
    if (sec.hidden) return;
    const grid = $('#grid');
    const ctl = $('.work__controls', sec);
    W.tiles = $$('.tile', grid).map((el) => ({ el, p: BY_SLUG.get(el.dataset.slug) }));

    // The sticky bar's height feeds scroll-padding, so focused tiles never hide under it.
    const syncCtl = () => root.style.setProperty('--controls-h', `${ctl.offsetHeight}px`);
    syncCtl();
    if ('ResizeObserver' in window) new ResizeObserver(syncCtl).observe(ctl);

    // After a filter change deep in the grid, bring the results back under the bar.
    const bringResultsIntoView = () => {
      const listEl = W.view === 'grid' ? grid : $('#index');
      const top = listEl.getBoundingClientRect().top;
      if (top < ctl.getBoundingClientRect().bottom - 1) {
        const navH = parseFloat(getComputedStyle(root).getPropertyValue('--nav-h')) || 64;
        const sticky = getComputedStyle(ctl).position === 'sticky';
        scrollTo({ top: top + scrollY - (sticky ? ctl.offsetHeight : 0) - navH - 16, behavior: reduced ? 'instant' : 'smooth' });
      }
    };

    $('.chips', sec).addEventListener('focusin', (e) => {
      if (e.target.matches('.chip')) e.target.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    });
    sec.addEventListener('click', (e) => {
      const chip = e.target.closest('[data-cat]');
      const fmt = e.target.closest('[data-fmt]');
      const view = e.target.closest('[data-view]');
      const sort = e.target.closest('[data-sort]');
      if (chip) { bringResultsIntoView(); W.cat = chip.dataset.cat; applyFilters(true); }
      else if (fmt) { bringResultsIntoView(); W.fmt = fmt.dataset.fmt; applyFilters(true); }
      else if (view) { bringResultsIntoView(); setView(view.dataset.view); }
      else if (sort) sortIndex(sort.dataset.sort);
      else if (e.target.closest('[data-reset]')) { bringResultsIntoView(); W.cat = '*'; W.fmt = '*'; applyFilters(true); }
    });

    setView(store.get('bg-view') || 'grid', false);
    applyFilters(false);
    onResize(() => layoutGrid(false));
    onFontsReady(() => layoutGrid(false));
    if ('ResizeObserver' in window) {
      let w = grid.clientWidth;
      new ResizeObserver(() => { if (grid.clientWidth !== w) { w = grid.clientWidth; layoutGrid(false); } }).observe(grid);
    }

    // Quick previews: hover on desktop, a short dwell in the centre of the screen on touch.
    const tiles = W.tiles.map((t) => t.el);
    const playing = new Set();
    const previewsOK = () => !reduced && !still;
    if (mqFine.matches) {
      tiles.forEach((el) => {
        const v = $('video', el);
        const m = $('.media', el);
        el.addEventListener('pointerenter', () => { if (previewsOK()) { Media.play(v, true); playing.add(m); } });
        el.addEventListener('pointerleave', () => { Media.pause(v); playing.delete(m); });
        el.addEventListener('focus', () => { if (autoplayOK()) { Media.play(v, true); playing.add(m); } });
        el.addEventListener('blur', () => { Media.pause(v); playing.delete(m); });
      });
    } else if ('IntersectionObserver' in window) {
      const band = new IntersectionObserver((entries) => {
        entries.forEach((en) => {
          const el = en.target;
          const m = $('.media', el);
          const v = $('video', el);
          clearTimeout(el._bandT);
          el._inBand = en.isIntersecting;
          if (en.isIntersecting && autoplayOK()) {
            // A fling passes straight through: only tiles that stay a moment start loading.
            el._bandT = setTimeout(() => {
              if (!autoplayOK() || Viewer.current || !el._inBand) return;
              Media.play(v); playing.add(m);
              if (playing.size > 2) { const first = playing.values().next().value; Media.pause($('video', first)); playing.delete(first); }
            }, 300);
          } else { Media.pause(v); playing.delete(m); }
        });
      }, { rootMargin: '-38% 0px -38% 0px' });
      tiles.forEach((el) => band.observe(el));
    }

    // Preview progress lines + a gentle parallax inside each thumbnail.
    const onScreen = new Set();
    if ('IntersectionObserver' in window) {
      const byEl = new Map(W.tiles.map((t) => [t.el, t]));
      const vis = new IntersectionObserver((entries) => entries.forEach((en) => {
        const t = byEl.get(en.target);
        if (en.isIntersecting) { onScreen.add(t); W.parDirty = true; wake(); }
        else {
          onScreen.delete(t);
          // Far off screen: let go of the preview's buffer (the poster stays).
          Media.release($('video', en.target));
        }
      }), { rootMargin: '200px 0px' });
      tiles.forEach((el) => vis.observe(el));
    }
    let lastSy = -1;
    addTicker(() => {
      let moving = false;
      playing.forEach((m) => {
        const v = $('video', m);
        if (!v || v.paused) return;
        moving = true;
        if (v.duration) m.style.setProperty('--prog', (v.currentTime / v.duration).toFixed(4));
      });
      if (!reduced && W.view === 'grid' && (S.sy !== lastSy || W.parDirty)) {
        lastSy = S.sy;
        W.parDirty = false;
        onScreen.forEach((t) => {
          if (!t || t.mh == null) return;
          const center = W.gridTop + t.y + t.mh / 2 - S.sy - S.vh / 2;
          const par = clamp(-center / S.vh, -1, 1) * t.mh * 0.035;
          if (t.par === undefined || Math.abs(par - t.par) > 0.1) {
            t.el.style.setProperty('--par', `${par.toFixed(1)}px`);
            t.par = par;
          }
        });
      }
      return moving;
    });
    initFloat();
  }

  /** Index view: a preview that trails the pointer while you scan the list. */
  function initFloat() {
    const fl = $('#float');
    if (!mqFine.matches || !fl) return;
    const idx = $('#index');
    const cache = new Map();
    let cur = null;
    let x = S.px;
    let y = S.py;
    let tilt = 0;
    const show = (p) => {
      if (cur) Media.pause($('video', cur));
      let node = cache.get(p.slug);
      if (!node) {
        const wrap = document.createElement('div');
        wrap.innerHTML = mediaHTML(p);
        node = wrap.firstElementChild;
        cache.set(p.slug, node);
      }
      fl.replaceChildren(node);
      fl.style.setProperty('--fw', p.vertical ? '210px' : `${Math.round(Math.min(380, 214 * p.aspect))}px`);
      if (!reduced && !still) Media.play($('video', node), true);
      cur = node;
      fl.classList.add('is-on');
      wake();
    };
    const hide = () => { fl.classList.remove('is-on'); if (cur) Media.pause($('video', cur)); };
    idx.addEventListener('pointerover', (e) => {
      const row = e.target.closest('.index__row');
      if (!row || e.pointerType !== 'mouse') return;
      const p = BY_SLUG.get(row.dataset.slug);
      if (p && (!cur || cache.get(p.slug) !== cur || !fl.classList.contains('is-on'))) show(p);
    });
    idx.addEventListener('pointerleave', hide);
    addEventListener('scroll', () => { if (fl.classList.contains('is-on') && !idx.matches(':hover')) hide(); }, { passive: true });
    addTicker((dt) => {
      if (!fl.classList.contains('is-on')) { x = S.px; y = S.py; return false; }
      const k = 1 - Math.exp(-dt * 10);
      const dx = S.px - x;
      x += dx * k;
      y += (S.py - y) * k;
      tilt += (clamp(dx * 0.06, -8, 8) - tilt) * k;
      const w = fl.offsetWidth;
      const h = fl.offsetHeight;
      const left = S.px + w + 48 > S.vw ? x - w - 32 : x + 32;
      const top = clamp(y - h / 2, 16, S.vh - h - 60);
      fl.style.transform = `translate3d(${left.toFixed(1)}px, ${top.toFixed(1)}px, 0) rotate(${reduced ? 0 : tilt.toFixed(2)}deg)`;
      return Math.abs(dx) > 0.3 || Math.abs(S.py - y) > 0.3 || Math.abs(tilt) > 0.05;
    });
  }

  /* ---------- 8. About, contact, footer ---------- */
  function renderAbout() {
    const sec = $('#about');
    const statement = ABOUT.statement || '';
    const bio = list(ABOUT.bio);
    const cols = [['Services', ABOUT.services], ['Tools', ABOUT.tools], ['Selected clients', ABOUT.clients]]
      .filter(([, items]) => list(items).length);
    if (!statement && !bio.length && !cols.length) { sec.hidden = true; return; }
    sec.innerHTML = `
      <div class="section-head"><h2 class="section-title rv" id="about-title">About</h2></div>
      <div class="about__grid">
        <aside class="about__aside">
          ${ABOUT.portrait ? `<img class="about__portrait rv rv--clip" src="${esc(ABOUT.portrait)}" alt="Portrait of ${esc(SITE.name || '')}" loading="lazy">` : ''}
          ${SITE.location ? `<p class="eyebrow mono">${esc(SITE.location)}</p>` : ''}
          ${SITE.availability ? `<p class="status mono${SITE.available === false ? ' status--off' : ''}"><i class="status__dot"></i>${esc(SITE.availability)}</p>` : ''}
        </aside>
        <div>
          ${statement ? `<p class="about__statement">${statement.split(/\s+/).map((w) => `<span class="w">${esc(w)}</span>`).join(' ')}</p>` : ''}
          ${bio.length ? `<div class="about__bio rv">${bio.map((b) => `<p>${esc(b)}</p>`).join('')}</div>` : ''}
          ${cols.length ? `<div class="about__lists">${cols.map(([h, items], ci) => `
            <div class="rv" style="--d:${ci * 0.08}s">
              <h3 class="mono">${esc(h)}</h3>
              <ul>${list(items).map((it, i) => `<li><span>${esc(it)}</span><span class="mono">${pad(i + 1)}</span></li>`).join('')}</ul>
            </div>`).join('')}</div>` : ''}
        </div>
      </div>`;
  }

  function initAbout() {
    const st = $('.about__statement');
    if (!st) return;
    const words = $$('.w', st);
    const n = words.length;
    let last = -1;
    addTicker(() => {
      if (reduced) { if (last !== n) { words.forEach((w) => w.style.setProperty('--o', 1)); last = n; } return false; }
      const r = st.getBoundingClientRect();
      if (r.bottom < -100 || r.top > S.vh + 100) return false;
      const p = clamp((S.vh * 0.85 - r.top) / (r.height + S.vh * 0.35), 0, 1);
      const lit = p * (n + 3);
      if (Math.abs(lit - last) < 0.02) return false;
      last = lit;
      words.forEach((w, i) => w.style.setProperty('--o', clamp(lit - i, 0.16, 1).toFixed(3)));
      return false;
    });
  }

  let contactKinetic = null;
  function renderContact() {
    const sec = $('#contact');
    const lines = list(CONTACT.title).length ? list(CONTACT.title) : ["Let's talk"];
    const email = SITE.email || '';
    sec.innerHTML = `
      <div class="contact__inner">
        <p class="eyebrow mono">Contact</p>
        <h2 class="contact__title" id="contact-title"><span class="vh">${esc(lines.join(' '))}</span><span class="k" aria-hidden="true"></span></h2>
        ${CONTACT.note ? `<p class="contact__note">${esc(CONTACT.note)}</p>` : ''}
        ${email ? `<a class="contact__mail" href="mailto:${esc(email)}">${esc(email)}</a>
        <div class="contact__row">
          <button class="btn" type="button" data-copy="${esc(email)}"><span class="btn__icon">${ICON.copy}</span>Copy email</button>
        </div>` : ''}
        <div class="contact__cols">
          ${list(SITE.socials).length ? `<div><h3 class="mono">Elsewhere</h3><ul>${list(SITE.socials).map((s) => `<li><a class="link-arrow" href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.label)} ${ICON.out}</a></li>`).join('')}</ul></div>` : ''}
          <div><h3 class="mono">Local time</h3><p class="clock" data-clock>--:--:--</p><p class="mono" style="color:var(--ink-3)">${esc(SITE.timezone || '')}</p></div>
          ${SITE.availability ? `<div><h3 class="mono">Availability</h3><p class="status mono${SITE.available === false ? ' status--off' : ''}"><i class="status__dot"></i>${esc(SITE.availability)}</p></div>` : ''}
        </div>
      </div>`;
    contactKinetic = new Kinetic($('.contact__title .k', sec), lines, { w: 96, amp: 80, radius: 0.13, fill: 0.93 });

    const foot = $('#footer');
    foot.innerHTML = `
      <span>© ${new Date().getFullYear()} ${esc(SITE.name || '')}${SITE.role ? ` · ${esc(SITE.role)}` : ''}</span>
      <span>${PROJECTS.length} projects · ${timecode(totalRuntime, FPS)} of motion</span>
      <button class="rewind mono" type="button" data-rewind>${ICON.rewind}Rewind to 00:00:00:00</button>`;
  }

  function initContact() {
    const sec = $('#contact');
    const title = $('.contact__title', sec);
    const fit = () => contactKinetic.fit();
    fit();
    onResize(fit);
    onFontsReady(fit);
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(([en]) => {
        contactKinetic.visible = en.isIntersecting;
        if (en.isIntersecting) contactKinetic.start(0);
        wake();
      }, { threshold: 0.2 }).observe(title);
    } else contactKinetic.start(0);
    addTicker((dt, now) => contactKinetic.update(dt, now));

    const clockEl = $('[data-clock]', sec);
    let fmt;
    try {
      fmt = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false, timeZone: SITE.timezone || undefined });
    } catch (e) {
      fmt = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
    }
    const tick = () => { clockEl.textContent = fmt.format(new Date()); };
    tick();
    setInterval(tick, 1000);
  }

  /* ---------- 9. Timeline rail, cursor, theme, reveal ---------- */
  const RAIL = { keys: [], max: 1 };
  let railQueued = false;
  function requestRailMeasure() {
    if (railQueued) return;
    railQueued = true;
    requestAnimationFrame(() => { railQueued = false; measureRail(); });
  }
  function renderRail() {
    const rail = $('#rail');
    const secs = [['top', 'Reel'], ['highlights', 'Selected'], ['work', 'Work'], ['about', 'About'], ['contact', 'Contact']]
      .filter(([id]) => { const el = document.getElementById(id); return el && !el.hidden; });
    rail.innerHTML = `
      <button class="rail__motion" type="button" data-motion aria-pressed="false" aria-label="Pause motion" title="Pause motion">
        <span class="i-pause">${ICON.pause}</span><span class="i-play">${ICON.play}</span>
      </button>
      <span class="rail__tc mono" aria-hidden="true">00:00:00:00</span>
      <div class="rail__track">
        <div class="rail__done"></div>
        ${secs.map(([id, label]) => `<button class="rail__key mono" type="button" data-jump="${id}" aria-label="Jump to ${label}"><i class="kf"></i><span class="rail__label">${label}</span></button>`).join('')}
        <div class="rail__head"></div>
      </div>
      <span class="rail__fps mono" aria-hidden="true">${FPS} fps</span>`;
  }
  function measureRail() {
    const rail = $('#rail');
    RAIL.max = Math.max(1, document.documentElement.scrollHeight - innerHeight);
    RAIL.keys = $$('.rail__key', rail).map((el) => {
      const sec = document.getElementById(el.dataset.jump);
      const top = sec ? sec.getBoundingClientRect().top + scrollY : 0;
      const at = clamp(top / RAIL.max, 0, 1);
      el.style.setProperty('--at', at.toFixed(4));
      return { el, id: el.dataset.jump, at, top };
    });
    wake();
  }
  function initRail() {
    const rail = $('#rail');
    const track = $('.rail__track', rail);
    const tc = $('.rail__tc', rail);
    const navLinks = $$('.nav__link');
    measureRail();
    onResize(measureRail);
    onFontsReady(measureRail);
    if ('ResizeObserver' in window) new ResizeObserver(requestRailMeasure).observe(document.body);

    let dragging = false;
    const seek = (e) => {
      const r = track.getBoundingClientRect();
      const p = clamp((e.clientX - r.left) / r.width, 0, 1);
      scrollTo({ top: p * RAIL.max, behavior: 'instant' });
    };
    track.addEventListener('pointerdown', (e) => {
      if (e.target.closest('.rail__key')) return;
      dragging = true;
      track.setPointerCapture(e.pointerId);
      seek(e);
    });
    track.addEventListener('pointermove', (e) => { if (dragging) seek(e); });
    const end = () => { dragging = false; };
    track.addEventListener('pointerup', end);
    track.addEventListener('pointercancel', end);

    let lastTc = '';
    let lastP = -1;
    let lastActive = '';
    addTicker(() => {
      const p = clamp(S.sy / RAIL.max, 0, 1);
      if (Math.abs(p - lastP) > 0.00005) { track.style.setProperty('--p', p.toFixed(4)); lastP = p; }
      const t = timecode(p * totalRuntime, FPS);
      if (t !== lastTc) { tc.textContent = t; lastTc = t; }
      let active = '';
      RAIL.keys.forEach((k) => {
        const passed = S.y + innerHeight * 0.4 >= k.top;
        k.el.classList.toggle('is-passed', passed);
        if (passed) active = k.id;
      });
      if (active !== lastActive) {
        lastActive = active;
        RAIL.keys.forEach((k) => k.el.classList.toggle('is-active', k.id === active));
        navLinks.forEach((a) => a.setAttribute('aria-current', String(a.dataset.section === active)));
      }
      return false;
    });
  }

  function initCursor() {
    const cur = $('#cursor');
    if (!mqFine.matches || !cur) return;
    root.classList.add('has-cursor');
    let x = S.px;
    let y = S.py;
    let target = null;
    document.addEventListener('pointerover', (e) => {
      const t = e.target.closest('[data-cursor]');
      if (t === target) return;
      target = t;
      if (t) {
        const meta = t.getAttribute('data-cursor-meta');
        cur.innerHTML = `<span><b>${esc(t.getAttribute('data-cursor'))}</b>${meta ? `<small class="mono">${esc(meta)}</small>` : ''}</span>`;
        cur.classList.add('is-on');
      } else cur.classList.remove('is-on');
    });
    root.addEventListener('mouseleave', () => { target = null; cur.classList.remove('is-on'); });
    addTicker((dt) => {
      const k = reduced ? 1 : 1 - Math.exp(-dt * 16);
      x += (S.px - x) * k;
      y += (S.py - y) * k;
      cur.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
      return Math.abs(S.px - x) > 0.3 || Math.abs(S.py - y) > 0.3;
    }, false);
  }

  function initTheme() {
    const btn = $('#theme-toggle');
    const meta = $('meta[name="theme-color"]');
    const current = () => root.getAttribute('data-theme') || (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
    const sync = () => {
      const next = current() === 'dark' ? 'light' : 'dark';
      btn.setAttribute('aria-label', `Switch to ${next} theme`);
      btn.title = `Switch to ${next} theme`;
      if (meta) meta.setAttribute('content', getComputedStyle(root).getPropertyValue('--bg').trim() || '#0d0e12');
    };
    sync();
    btn.addEventListener('click', () => {
      const next = current() === 'dark' ? 'light' : 'dark';
      const apply = () => { root.setAttribute('data-theme', next); store.set('bg-theme', next); sync(); };
      if (hasVT && !reduced) {
        const r = btn.getBoundingClientRect();
        root.style.setProperty('--tx', `${r.left + r.width / 2}px`);
        root.style.setProperty('--ty', `${r.top + r.height / 2}px`);
        root.classList.add('theme-vt');
        const vt = document.startViewTransition(apply);
        vt.finished.finally(() => root.classList.remove('theme-vt'));
      } else apply();
    });
  }

  function initReveal() {
    const els = $$('.rv');
    if (reduced || !('IntersectionObserver' in window)) { els.forEach((el) => el.classList.add('is-in')); return; }
    const io = new IntersectionObserver((entries) => entries.forEach((en) => {
      if (en.isIntersecting) { en.target.classList.add('is-in'); io.unobserve(en.target); }
    }), { rootMargin: '0px 0px -6% 0px' });
    els.forEach((el) => {
      // Anything already on the first screen stays put: the page is complete at rest.
      if (el.getBoundingClientRect().top < innerHeight) return;
      el.classList.add('is-armed');
      io.observe(el);
    });
  }

  function makeNoise() {
    try {
      const size = 128;
      const c = document.createElement('canvas');
      c.width = c.height = size;
      const ctx = c.getContext('2d');
      const img = ctx.createImageData(size, size);
      for (let i = 0; i < img.data.length; i += 4) {
        const v = Math.random() < 0.5 ? 0 : 255;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
        img.data[i + 3] = Math.random() * 140;
      }
      ctx.putImageData(img, 0, 0);
      root.style.setProperty('--noise', `url(${c.toDataURL('image/png')})`);
    } catch (e) { /* grain is decoration only */ }
  }

  /* ---------- 10. Viewer + player ---------- */
  class Player {
    constructor() {
      const el = document.createElement('div');
      el.className = 'player';
      el.innerHTML = `
        <video playsinline preload="metadata"></video>
        <button class="player__big" type="button" tabindex="-1" aria-hidden="true">${ICON.play}</button>
        <div class="player__spinner" aria-hidden="true"></div>
        <button class="player__unmute mono" type="button">${ICON.sound}Sound on</button>
        <p class="player__error mono" role="alert"><b>Video unavailable</b><span data-err></span></p>
        <div class="player__ui">
          <button class="player__btn" type="button" data-act="play" aria-label="Play">
            <span class="i-play">${ICON.play}</span><span class="i-pause">${ICON.pause}</span>
          </button>
          <span class="player__tc mono" aria-hidden="true">00:00:00:00</span>
          <div class="player__scrub" role="slider" tabindex="0" aria-label="Seek" aria-valuemin="0" aria-valuemax="0" aria-valuenow="0">
            <div class="player__rail"><div class="player__buf"></div><div class="player__fill"></div></div>
            <div class="player__head"></div>
            <div class="player__hover mono">00:00:00:00</div>
          </div>
          <span class="player__dur mono" aria-hidden="true">00:00:00:00</span>
          <span class="player__fps mono" aria-hidden="true"></span>
          <button class="player__btn" type="button" data-act="mute" aria-label="Mute">
            <span class="i-sound">${ICON.sound}</span><span class="i-muted">${ICON.muted}</span>
          </button>
          <button class="player__btn" type="button" data-act="fs" aria-label="Fullscreen">
            <span class="i-expand">${ICON.expand}</span><span class="i-shrink">${ICON.shrink}</span>
          </button>
        </div>`;
      this.el = el;
      this.v = $('video', el);
      this.tc = $('.player__tc', el);
      this.dur = $('.player__dur', el);
      this.fpsEl = $('.player__fps', el);
      this.scrub = $('.player__scrub', el);
      this.hoverEl = $('.player__hover', el);
      this.playBtn = $('[data-act="play"]', el);
      this.muteBtn = $('[data-act="mute"]', el);
      this.fsBtn = $('[data-act="fs"]', el);
      this.fps = FPS;
      this.idleTimer = 0;
      this.bind();
    }
    set(k, v) {
      this.el.dataset[k] = String(v);
      // Keep the toggles' names in step with what they will do next.
      if (k === 'playing') this.playBtn.setAttribute('aria-label', v ? 'Pause' : 'Play');
      if (k === 'muted') this.muteBtn.setAttribute('aria-label', v ? 'Unmute' : 'Mute');
      if (k === 'fs') this.fsBtn.setAttribute('aria-label', v ? 'Exit fullscreen' : 'Fullscreen');
    }
    bind() {
      const v = this.v;
      const el = this.el;
      v.addEventListener('play', () => { this.set('playing', true); this.set('ended', false); this.poke(); wake(); });
      v.addEventListener('pause', () => { this.set('playing', false); this.poke(); });
      v.addEventListener('ended', () => { this.set('playing', false); this.set('ended', true); });
      v.addEventListener('waiting', () => this.set('waiting', true));
      v.addEventListener('playing', () => this.set('waiting', false));
      v.addEventListener('canplay', () => this.set('waiting', false));
      v.addEventListener('volumechange', () => this.set('muted', v.muted));
      v.addEventListener('loadedmetadata', () => {
        this.dur.textContent = timecode(v.duration, this.fps);
        this.scrub.setAttribute('aria-valuemax', String(Math.round(v.duration)));
        if (this.onMeta) this.onMeta(v);
      });
      v.addEventListener('error', () => {
        if (!v.getAttribute('src')) return;
        this.set('error', true); this.set('waiting', false); this.set('automuted', false);
        const src = v.getAttribute('src');
        $('[data-err]', el).textContent = src.startsWith('blob:') ? '' : src;
      });
      ['seeked', 'progress', 'loadedmetadata', 'ended', 'timeupdate'].forEach((ev) => v.addEventListener(ev, () => this.render()));
      v.addEventListener('click', () => this.toggle());
      v.addEventListener('dblclick', () => this.fullscreen());
      $('.player__big', el).addEventListener('click', () => this.toggle());
      $('.player__unmute', el).addEventListener('click', () => { v.muted = false; this.set('automuted', false); });
      el.addEventListener('click', (e) => {
        const b = e.target.closest('[data-act]');
        if (!b) return;
        if (b.dataset.act === 'play') this.toggle();
        if (b.dataset.act === 'mute') { v.muted = !v.muted; this.set('automuted', false); }
        if (b.dataset.act === 'fs') this.fullscreen();
      });
      el.addEventListener('pointermove', () => this.poke());
      el.addEventListener('focusin', () => this.poke());
      el.addEventListener('keydown', () => this.poke());
      document.addEventListener('fullscreenchange', () => this.set('fs', document.fullscreenElement === el));

      const sc = this.scrub;
      let dragging = false;
      let wasPlaying = false;
      const at = (e) => { const r = sc.getBoundingClientRect(); return clamp((e.clientX - r.left) / r.width, 0, 1); };
      sc.addEventListener('pointerdown', (e) => {
        dragging = true; wasPlaying = !v.paused;
        sc.setPointerCapture(e.pointerId); sc.classList.add('is-dragging');
        v.pause(); this.seekTo(at(e) * (v.duration || 0));
      });
      sc.addEventListener('pointermove', (e) => {
        const p = at(e);
        sc.style.setProperty('--hx', p.toFixed(4));
        this.hoverEl.textContent = timecode(p * (v.duration || 0), this.fps);
        if (dragging) this.seekTo(p * (v.duration || 0));
      });
      const up = () => {
        if (!dragging) return;
        dragging = false; sc.classList.remove('is-dragging');
        if (wasPlaying) v.play().catch(() => {});
      };
      sc.addEventListener('pointerup', up);
      sc.addEventListener('pointercancel', up);
      sc.addEventListener('keydown', (e) => {
        const step = e.shiftKey ? 1 / this.fps : 1;
        if (e.key === 'ArrowRight') { e.preventDefault(); e.stopPropagation(); this.seekTo(v.currentTime + step); }
        if (e.key === 'ArrowLeft') { e.preventDefault(); e.stopPropagation(); this.seekTo(v.currentTime - step); }
        if (e.key === 'Home') { e.preventDefault(); this.seekTo(0); }
        if (e.key === 'End') { e.preventDefault(); this.seekTo(v.duration || 0); }
      });
    }
    poke() {
      this.set('idle', false);
      clearTimeout(this.idleTimer);
      this.idleTimer = setTimeout(() => this.set('idle', true), 2400);
    }
    load(p) {
      const v = this.v;
      this.p = p;
      this.fps = p.fps || FPS;
      v.pause();
      v.poster = p.poster || '';
      v.src = p.video;
      this.set('playing', false); this.set('ended', false); this.set('automuted', false); this.set('waiting', false); this.set('error', false);
      this.el.style.setProperty('--pos', 0);
      this.el.style.setProperty('--buf', 0);
      this.tc.textContent = timecode(0, this.fps);
      this.dur.textContent = timecode(p.seconds || 0, this.fps);
      this.fpsEl.textContent = `${Math.round(this.fps * 100) / 100} fps`;
    }
    play(withSound) {
      const v = this.v;
      v.muted = !withSound;
      this.set('muted', v.muted);
      const src = v.getAttribute('src');
      const pr = v.play();
      if (pr && pr.catch) {
        pr.catch((err) => {
          // Only a real autoplay block falls back to a muted start. pause() or a new
          // source also reject a pending play() (AbortError): leave those alone.
          if (!err || err.name !== 'NotAllowedError' || v.muted || v.getAttribute('src') !== src) return;
          v.muted = true; this.set('automuted', true);
          v.play().catch(() => { this.set('playing', false); this.set('automuted', false); });
        });
      }
    }
    unload() {
      const v = this.v;
      v.pause();
      v.removeAttribute('src');
      v.removeAttribute('poster');
      try { v.load(); } catch (e) { /* ignore */ }
      if (document.fullscreenElement === this.el) document.exitFullscreen().catch(() => {});
    }
    toggle() {
      const v = this.v;
      if (v.paused || v.ended) {
        if (this.el.dataset.automuted === 'true') { v.muted = false; this.set('automuted', false); }
        v.play().catch(() => {});
      } else v.pause();
    }
    seekTo(t) {
      const v = this.v;
      if (!v.duration) return;
      v.currentTime = clamp(t, 0, v.duration - 0.001);
      this.render();
    }
    stepFrames(n) {
      const v = this.v;
      v.pause();
      // The frame on screen is the one the timecode shows; land in the middle of the next one.
      const f = Math.floor(v.currentTime * this.fps + 1e-3) + n;
      this.seekTo((f + 0.5) / this.fps);
    }
    fullscreen() {
      const el = this.el;
      if (document.fullscreenElement) { document.exitFullscreen().catch(() => {}); return; }
      if (el.requestFullscreen) el.requestFullscreen().catch(() => {});
      else if (this.v.webkitEnterFullscreen) this.v.webkitEnterFullscreen();
    }
    render() {
      const v = this.v;
      const d = v.duration || 0;
      this.tc.textContent = timecode(v.currentTime, this.fps);
      this.el.style.setProperty('--pos', d ? (v.currentTime / d).toFixed(5) : 0);
      if (d && v.buffered.length) this.el.style.setProperty('--buf', (v.buffered.end(v.buffered.length - 1) / d).toFixed(4));
      this.scrub.setAttribute('aria-valuenow', String(Math.round(v.currentTime)));
      this.scrub.setAttribute('aria-valuetext', timecode(v.currentTime, this.fps));
    }
  }

  const Viewer = {
    isOpen: false,
    closing: false,
    pushed: false,
    ignorePop: false,
    current: null,
    list: [],
    stageMode: 'video',
    init() {
      this.el = $('#viewer');
      this.el.tabIndex = -1;
      this.el.innerHTML = `
        <div class="viewer__bar">
          <button class="viewer__close mono" type="button" data-close>${ICON.close}<span>Close</span><kbd>Esc</kbd></button>
          <p class="viewer__count mono"></p>
          <div class="viewer__nav">
            <button type="button" data-step="-1" aria-label="Previous project">${ICON.prev}</button>
            <button type="button" data-step="1" aria-label="Next project">${ICON.next}</button>
          </div>
        </div>
        <div class="viewer__scroll"><div class="viewer__content"></div></div>`;
      this.scroller = $('.viewer__scroll', this.el);
      this.content = $('.viewer__content', this.el);
      this.count = $('.viewer__count', this.el);
      this.navEl = $('.viewer__nav', this.el);
      this.player = new Player();
      this.el.addEventListener('click', (e) => {
        if (e.target.closest('[data-close]')) this.close();
        const s = e.target.closest('[data-step]');
        if (s) this.step(+s.dataset.step);
        if (e.target.closest('[data-share]')) copyText(location.href, 'Link copied');
      });
      addEventListener('keydown', (e) => this.onKey(e));
      // Timecode + progress follow the frame loop while playing.
      addTicker(() => {
        if (this.isOpen && this.stageMode === 'video' && !this.player.v.paused) { this.player.render(); return true; }
        return false;
      }, false);
    },
    listFor(p) {
      if (p.isReel) return [p];
      const f = filtered();
      return f.includes(p) ? f : PROJECTS;
    },
    originFor(p) {
      const cands = [
        $(`#grid .tile[data-slug="${p.slug}"] .media`),
        $(`.hl__link[data-open="${p.slug}"] .media`),
        p.isReel ? $('.hero__media') : null,
      ];
      return cands.find((el) => {
        if (!el || el.closest('[hidden], .is-out')) return false;
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth;
      }) || null;
    },
    open(p, { origin = null, gesture = false, history: hist = 'push' } = {}) {
      if (!p || this.closing) return;
      const wasOpen = this.isOpen;
      if (wasOpen && this.current && this.current.slug === p.slug) return;
      this.list = this.listFor(p);
      this.render(p);
      // Start playback inside the click so the browser allows sound.
      if (this.stageMode === 'video' && (gesture || autoplayOK())) this.player.play(gesture);

      try {
        const url = `#${p.slug}`;
        if (hist === 'push' && !wasOpen) { history.pushState({ viewer: p.slug }, '', url); this.pushed = true; }
        else if (hist !== 'none') history.replaceState(history.state, '', url);
      } catch (e) { /* history is unavailable in some sandboxes */ }
      document.title = `${p.title} — ${SITE.name || ''}`;

      if (wasOpen) {
        if (!reduced) this.content.animate([{ opacity: 0, transform: 'translateY(24px)' }, { opacity: 1, transform: 'none' }], { duration: 600, easing: 'cubic-bezier(.16,1,.3,1)' });
        return;
      }
      const active = document.activeElement;
      this.returnFocus = (active && active.closest && active.closest('a, button')) || active;
      let shown = false;
      const show = () => {
        if (shown) return;
        shown = true;
        this.el.hidden = false;
        this.isOpen = true;
        // Background loops stop while the viewer covers the page; the visible ones resume on close.
        this.paused = $$('#main video').filter((v) => !v.paused);
        this.paused.forEach((v) => v.pause());
        this.scroller.scrollTop = 0;
        const sbw = innerWidth - root.clientWidth;
        root.style.setProperty('--sbw', `${sbw}px`);
        root.classList.add('is-locked', 'is-viewer-open');
        ['#nav', '#main', '#footer', '#rail', '#menu', '.skip'].forEach((s) => { const n = $(s); if (n) n.inert = true; });
        // Focus the dialog itself: Space then plays/pauses instead of pressing Close.
        this.el.focus({ preventScroll: true });
        wake();
      };
      const from = origin && this.visible(origin) ? origin : null;
      if (from && hasVT && !reduced) {
        from.style.viewTransitionName = 'vt-media';
        wake();
        const vt = document.startViewTransition(() => {
          from.style.viewTransitionName = '';
          show();
          if (this.stage) this.stage.style.viewTransitionName = 'vt-media';
        });
        // A transition can be skipped or arrive late (background tab, busy page): never leave the click unanswered.
        const fallback = () => { if (!shown) { from.style.viewTransitionName = ''; show(); } };
        const timer = setTimeout(fallback, 450);
        vt.updateCallbackDone.then(() => clearTimeout(timer), fallback);
        vt.finished.finally(() => { if (this.stage) this.stage.style.viewTransitionName = ''; });
      } else {
        show();
        if (!reduced) {
          this.el.classList.add('is-entering');
          setTimeout(() => this.el.classList.remove('is-entering'), 720);
        }
      }
    },
    visible(el) {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.bottom > 0 && r.top < innerHeight;
    },
    close({ fromHistory = false } = {}) {
      if (!this.isOpen || this.closing) return;
      this.closing = true;
      const p = this.current;
      let finished = false;
      const finish = () => {
        if (finished) return;
        finished = true;
        this.el.hidden = true;
        root.classList.remove('is-locked', 'is-viewer-open');
        ['#nav', '#main', '#footer', '#rail', '.skip'].forEach((s) => { const n = $(s); if (n) n.inert = false; });
        this.player.unload();
        this.content.innerHTML = '';
        this.isOpen = false;
        this.current = null;
        this.closing = false;
        this.scroller.scrollTop = 0;
        document.title = baseTitle;
        if (autoplayOK()) {
          (this.paused || []).forEach((v) => {
            const hl = v.closest('.hl__link .media');
            const tile = v.closest('.tile');
            const back = hl ? hl._inView : tile ? tile._inBand : v.closest('.hero__media') && $('#top')._visible;
            if (back) Media.play(v);
          });
        }
        this.paused = [];
        const back = this.returnFocus && document.contains(this.returnFocus) ? this.returnFocus : null;
        if (back) back.focus({ preventScroll: true });
        this.returnFocus = null;
        wake();
      };
      const target = p ? this.originFor(p) : null;
      if (target && hasVT && !reduced && this.stage) {
        const stage = this.stage;
        stage.style.viewTransitionName = 'vt-media';
        wake();
        const vt = document.startViewTransition(() => {
          stage.style.viewTransitionName = '';
          finish();
          target.style.viewTransitionName = 'vt-media';
        });
        const fallback = () => { if (!finished) { stage.style.viewTransitionName = ''; finish(); } };
        const timer = setTimeout(fallback, 700);
        vt.updateCallbackDone.then(() => clearTimeout(timer), fallback);
        vt.finished.finally(() => { target.style.viewTransitionName = ''; });
      } else if (!reduced) {
        this.el.classList.add('is-leaving');
        setTimeout(() => { this.el.classList.remove('is-leaving'); finish(); }, 430);
      } else finish();

      if (!fromHistory) {
        try {
          if (this.pushed) { this.ignorePop = true; history.back(); }
          else history.replaceState(history.state, '', location.pathname + location.search);
        } catch (e) { /* ignore */ }
      }
      this.pushed = false;
    },
    step(d) {
      const p = this.current;
      if (!p || this.list.length < 2) return;
      const i = this.list.indexOf(p);
      const next = this.list[(i + d + this.list.length) % this.list.length];
      this.open(next, { gesture: true, history: 'replace' });
    },
    render(p) {
      this.current = p;
      const L = this.list;
      const i = L.indexOf(p);
      const n = L.length;
      this.count.innerHTML = p.isReel ? `<b>${esc(p.title)}</b>` : `<b>${esc(p.title)}</b><span> · ${pad(i + 1)} / ${pad(n)}</span>`;
      this.navEl.hidden = n < 2;
      const next = n > 1 ? L[(i + 1) % n] : null;
      const specs = [
        ['Client', p.client],
        ['Year', p.year],
        ['Role', p.role],
        ['Discipline', p.categories.join(', ')],
        ['Format', `${p.ratio} · ${p.vertical ? 'Vertical' : 'Horizontal'}`],
        ['Resolution', '', 'res'],
        ['Frame rate', `${Math.round(p.fps * 100) / 100} fps`],
        ['Length', p.seconds ? timecode(p.seconds, p.fps) : '', 'len'],
      ].filter(([, v, k]) => v || k);
      const embed = p.embed;
      const keys = mqFine.matches && !embed
        ? '<p class="mono viewer__keys"><kbd>Space</kbd> play · <kbd>←</kbd><kbd>→</kbd> 5 s · <kbd>,</kbd><kbd>.</kbd> one frame · <kbd>[</kbd><kbd>]</kbd> project · <kbd>F</kbd> fullscreen · <kbd>M</kbd> mute</p>'
        : '';

      this.content.innerHTML = `
        <article class="viewer__layout viewer__layout--${p.vertical ? 'v' : 'h'}">
          <div class="viewer__stage" style="--ar:${p.aspect}"></div>
          <div class="viewer__info">
            <div class="viewer__main">
              <p class="viewer__eyebrow mono">${[p.client, p.year].filter(Boolean).map(esc).join(' — ')}</p>
              <h2 class="viewer__title" id="viewer-title">${esc(p.title)}</h2>
              ${p.summary ? `<p class="viewer__summary">${esc(p.summary)}</p>` : ''}
              ${p.description.length ? `<div class="viewer__desc">${p.description.map((d) => `<p>${esc(d)}</p>`).join('')}</div>` : ''}
              ${p.tools.length || p.categories.length ? `<div class="tags mono">${p.categories.map((c) => `<span class="tag"><i class="swatch" style="--sw:${CAT_COLOR[c]}"></i>${esc(c)}</span>`).join('')}${p.tools.map((t) => `<span class="tag">${esc(t)}</span>`).join('')}</div>` : ''}
              <div class="viewer__actions">
                <button class="btn btn--ghost" type="button" data-share>${ICON.link}Copy link</button>
                ${p.links.map((l) => `<a class="btn btn--ghost" href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.label || 'Link')} ${ICON.out}</a>`).join('')}
              </div>
              ${keys}
            </div>
            <dl class="specs">${specs.map(([k, v, key]) => `<dt class="mono">${k}</dt><dd${key ? ` data-spec="${key}"` : ''}${key === 'len' || key === 'res' ? ' class="mono"' : ''}>${esc(v || '—')}</dd>`).join('')}</dl>
            ${p.credits.length ? `<div class="credits"><h3 class="mono">Credits</h3><ul>${p.credits.map((c) => `<li><span>${esc(c.role || '')}</span><span>${esc(c.name || '')}</span></li>`).join('')}</ul></div>` : ''}
          </div>
        </article>
        ${next ? `<a class="upnext" href="#${next.slug}" data-open="${next.slug}">
          <div>
            <p class="upnext__label mono"><i class="kf"></i>Next project · ${pad(((i + 1) % n) + 1)}/${pad(n)}</p>
            <p class="upnext__title">${esc(next.title)}</p>
          </div>
          ${mediaHTML(next)}
        </a>` : ''}`;

      this.stage = $('.viewer__stage', this.content);
      if (embed) {
        this.stageMode = 'embed';
        this.player.unload();
        this.stage.innerHTML = `<iframe src="${esc(embed)}" title="${esc(p.title)}" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen></iframe>`;
      } else {
        this.stageMode = 'video';
        this.player.load(p);
        this.stage.appendChild(this.player.el);
        this.player.onMeta = (v) => {
          const res = $('[data-spec="res"]', this.content);
          const len = $('[data-spec="len"]', this.content);
          if (res && v.videoWidth) res.textContent = `${v.videoWidth} × ${v.videoHeight}`;
          const d = v.duration;
          if (len && isFinite(d) && d > 0) len.textContent = timecode(d, p.fps);
          if (p.isReel && isFinite(d) && d > 0) {
            const lenEl = $('[data-reel-len]');
            if (lenEl) lenEl.textContent = clock(d);
          }
        };
      }
      const up = $('.upnext', this.content);
      if (up) {
        const v = $('video', up);
        up.addEventListener('pointerenter', () => { if (!reduced && !still) Media.play(v, true); });
        up.addEventListener('pointerleave', () => Media.pause(v));
      }
      this.scroller.scrollTop = 0;
    },
    onKey(e) {
      if (!this.isOpen) return;
      if (e.key === 'Escape') {
        if (!document.fullscreenElement) { e.preventDefault(); this.close(); }
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey || e.defaultPrevented) return;
      const tag = e.target.closest('input, textarea, select, [contenteditable="true"]');
      if (tag) return;
      const pl = this.player;
      // Buttons and links keep Space/Enter for themselves; the seek slider does not.
      const onControl = e.target.closest('button, a');
      const video = this.stageMode === 'video';
      switch (e.key) {
        case ' ':
        case 'k':
        case 'K':
          if (!video || (onControl && e.key === ' ')) return;
          e.preventDefault(); pl.toggle(); break;
        case 'ArrowRight': if (video) { e.preventDefault(); pl.seekTo(pl.v.currentTime + 5); } break;
        case 'ArrowLeft': if (video) { e.preventDefault(); pl.seekTo(pl.v.currentTime - 5); } break;
        case '.': if (video) { e.preventDefault(); pl.stepFrames(1); } break;
        case ',': if (video) { e.preventDefault(); pl.stepFrames(-1); } break;
        case 'm': case 'M': if (video) { pl.v.muted = !pl.v.muted; pl.set('automuted', false); } break;
        case 'f': case 'F': if (video) pl.fullscreen(); break;
        case ']': this.step(1); break;
        case '[': this.step(-1); break;
        default: break;
      }
    },
  };

  /* ---------- Router + global clicks ---------- */
  function route(initial) {
    let h = '';
    try { h = decodeURIComponent(location.hash.slice(1)); } catch (e) { h = location.hash.slice(1); }
    const p = BY_SLUG.get(h) || (h === 'showreel' ? viewerReel() : null);
    if (p) {
      if (!Viewer.isOpen || Viewer.current.slug !== p.slug) Viewer.open(p, { history: 'none', gesture: false });
      return;
    }
    if (Viewer.isOpen) Viewer.close({ fromHistory: true });
    if (initial && h) {
      const el = document.getElementById(h);
      if (el) setTimeout(() => scrollToEl(el, true), 60);
    }
  }
  function onHistory() {
    if (Viewer.ignorePop) { Viewer.ignorePop = false; return; }
    route(false);
  }

  /** Scroll to a section and move keyboard focus there too, so the next Tab continues from it. */
  function scrollToEl(el, instant) {
    const y = el.id === 'top' ? 0 : el.getBoundingClientRect().top + scrollY;
    scrollTo({ top: y, behavior: instant || reduced ? 'instant' : 'smooth' });
    if (!el.hasAttribute('tabindex') && !el.matches('a, button, input, select, textarea')) el.setAttribute('tabindex', '-1');
    el.focus({ preventScroll: true });
  }

  function initClicks() {
    document.addEventListener('click', (e) => {
      wake();
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const open = e.target.closest('[data-open]');
      if (open) {
        const p = BY_SLUG.get(open.dataset.open);
        if (!p) return;
        e.preventDefault();
        const origin = open.querySelector('.media') || (open.closest('.hl__item') && open.closest('.hl__item').querySelector('.media'));
        Viewer.open(p, { origin, gesture: true, history: Viewer.isOpen ? 'replace' : 'push' });
        return;
      }
      if (e.target.closest('[data-open-reel]')) {
        e.preventDefault();
        Viewer.open(viewerReel(), { origin: $('.hero__media'), gesture: true });
        return;
      }
      if (e.target.closest('[data-motion]')) { setStill(!still); return; }
      const copy = e.target.closest('[data-copy]');
      if (copy) { copyText(copy.dataset.copy, 'Email copied'); return; }
      if (e.target.closest('[data-rewind]')) { scrollToEl($('#top')); return; }
      const jump = e.target.closest('[data-jump]');
      if (jump) { const el = document.getElementById(jump.dataset.jump); if (el) scrollToEl(el); return; }
      const a = e.target.closest('a[href^="#"]');
      if (a) {
        const id = a.getAttribute('href').slice(1);
        const el = id && document.getElementById(id);
        if (el && !BY_SLUG.has(id)) { e.preventDefault(); scrollToEl(el); }
      }
    });
  }

  /* ---------- Resize + fonts plumbing ---------- */
  const resizeFns = [];
  const fontFns = [];
  function onResize(fn) { resizeFns.push(fn); }
  function onFontsReady(fn) { fontFns.push(fn); }
  let rTimer = 0;
  let lastW = innerWidth;
  let lastH = innerHeight;
  addEventListener('resize', () => {
    clearTimeout(rTimer);
    rTimer = setTimeout(() => {
      // Phone browsers resize the viewport as the URL bar hides: ignore those small height-only changes.
      const dw = Math.abs(innerWidth - lastW);
      const dh = Math.abs(innerHeight - lastH);
      if (!dw && dh < 120 && mqCoarse.matches) return;
      if (!dw && !dh) return;
      lastW = innerWidth; lastH = innerHeight;
      S.vw = innerWidth; S.vh = innerHeight;
      resizeFns.forEach((fn) => safe(fn));
      requestRailMeasure();
      wake();
    }, 140);
  });

  /* ---------- Boot ---------- */
  function boot() {
    root.classList.add('js');
    document.title = baseTitle;
    if (still) root.classList.add('is-still');

    // First screen: nav, hero and the viewer (so deep links and the reel button work at once).
    safe(renderNav);
    safe(renderHero);
    safe(() => Viewer.init());
    safe(initTheme);
    safe(initNavBehavior);
    safe(initHero);
    safe(initClicks);
    addEventListener('popstate', onHistory);
    addEventListener('hashchange', onHistory);
    mqReduce.addEventListener && mqReduce.addEventListener('change', (e) => { reduced = e.matches; wake(); });
    wake();

    // Everything below the fold follows in a second task, after the first paint.
    const rest = () => {
      safe(makeNoise);
      safe(renderHighlights);
      safe(renderWork);
      safe(renderAbout);
      safe(renderContact);
      safe(renderRail);
      safe(initHighlights);
      safe(initMarquee);
      safe(initWork);
      safe(initAbout);
      safe(initContact);
      safe(initRail);
      safe(initCursor);
      safe(initReveal);
      safe(() => setStill(still, false));

      const fontsDone = () => { fontFns.forEach((fn) => safe(fn)); requestRailMeasure(); };
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(fontsDone);
      addEventListener('load', fontsDone);
      safe(() => route(true));
      root.classList.add('is-ready');
    };
    // With a #hash the whole page is needed before routing, so do it all now.
    if (location.hash) rest();
    else requestAnimationFrame(() => setTimeout(rest, 0));
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
