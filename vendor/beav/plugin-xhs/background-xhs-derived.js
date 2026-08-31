/*
 * Derived from: F:\最新工作台\Beav-main\Beav-main\Plugin\src\background.js
 * Donor SHA256: 0D5EA8786A0F86F79F3B78B03C4BDD7635FF8A69C3B413BE37FE178418F27DE4
 * Source: Jamailar/Beav
 * License: MIT License - Non-Commercial Use Only
 * Modification: extracted XHS-only page payload functions. No Chrome, Knowledge,
 * Native Host, account-import, or desktop-bridge execution is included.
 * Redbook addition: allow explicitly user-bound search profile overlay context
 * when observed clicked profile ID equals canonical XHS state user ID.
 */

async function extractXhsNotePayload() {
  const inlineAssetMaxBytes = 6 * 1024 * 1024;

  function parseCountText(value) {
    if (!value) return 0;
    const text = String(value).trim();
    const cleaned = text.replace(/[\s,]/g, '').replace(/[^0-9.\u4e00-\u9fa5]/g, '');
    if (!cleaned) return 0;
    if (cleaned.includes('亿')) {
      const num = parseFloat(cleaned.replace('亿', ''));
      return Number.isNaN(num) ? 0 : Math.round(num * 100000000);
    }
    if (cleaned.includes('万')) {
      const num = parseFloat(cleaned.replace('万', ''));
      return Number.isNaN(num) ? 0 : Math.round(num * 10000);
    }
    const num = parseFloat(cleaned);
    return Number.isNaN(num) ? 0 : Math.round(num);
  }

  function getInitialState() {
    const scripts = document.querySelectorAll('script');
    for (const script of scripts) {
      const text = script.textContent || '';
      if (!text.includes('window.__INITIAL_STATE__=')) continue;
      try {
        const jsonText = text
          .replace('window.__INITIAL_STATE__=', '')
          .replace(/undefined/g, 'null')
          .replace(/;$/, '');
        return JSON.parse(jsonText);
      } catch {
        return null;
      }
    }
    return null;
  }

  function getActiveNoteDetailMask() {
    const strictMasks = Array.from(document.querySelectorAll('.note-detail-mask[note-id]'));
    const looseMasks = Array.from(document.querySelectorAll('.note-detail-mask'));
    const masks = strictMasks.length > 0 ? strictMasks : looseMasks;
    if (masks.length === 0) return null;
    const scored = masks
      .filter((mask) => mask instanceof Element)
      .map((mask, index) => {
        const style = window.getComputedStyle(mask);
        const rect = mask.getBoundingClientRect();
        const visible = style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 80 && rect.height > 80;
        const container = mask.querySelector('#noteContainer.note-container, #noteContainer, .note-container');
        const titleEl = container?.querySelector?.('#detail-title, .note-content #detail-title, .note-content .title');
        const titleText = (titleEl?.textContent || '').trim();
        const area = Math.max(0, rect.width * rect.height);
        let score = 0;
        if (visible) score += 100000;
        if (container) score += 10000;
        if (titleText) score += 1000;
        score += Math.floor(area / 100);
        score += index;
        return { mask, score };
      })
      .sort((a, b) => b.score - a.score);

    return scored[0]?.mask || masks[masks.length - 1] || null;
  }

  function getCurrentOpenedNoteId() {
    const mask = getActiveNoteDetailMask();
    if (!mask) return '';
    return String(mask.getAttribute('note-id') || '').trim();
  }

  function normalizeTitle(value) {
    return String(value || '').replace(/\s+/g, '').trim();
  }

  function toAbsoluteUrl(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    try {
      return new URL(raw, location.href).toString();
    } catch {
      return raw;
    }
  }

  function isCommentRelatedNode(el) {
    if (!el || !el.closest) return false;
    return Boolean(
      el.closest('.comments-el') ||
      el.closest('.comment-list') ||
      el.closest('.comment-item') ||
      el.closest('.comment-container') ||
      el.closest('.comments-container') ||
      el.closest('[class*="comment"]') ||
      el.closest('[id*="comment"]')
    );
  }

  function getCurrentNoteRoot() {
    const directRoot =
      document.querySelector('#noteContainer.note-container[data-render-status]') ||
      document.querySelector('#noteContainer.note-container') ||
      document.querySelector('#noteContainer');
    if (directRoot) return directRoot;

    const mask = getActiveNoteDetailMask();
    if (mask) {
      const scoped =
        mask.querySelector('#noteContainer.note-container') ||
        mask.querySelector('#noteContainer') ||
        mask.querySelector('.note-container') ||
        null;
      if (scoped) return scoped;
    }

    const anchor =
      document.querySelector('#detail-desc') ||
      document.querySelector('#detail-title') ||
      document.querySelector('.note-content') ||
      null;
    if (!anchor) return document.body;
    return (
      anchor.closest('#noteContainer.note-container') ||
      anchor.closest('#noteContainer') ||
      anchor.closest('.note-container') ||
      anchor.closest('#detail-container') ||
      anchor.closest('.note-content') ||
      anchor.closest('[class*="note-container"]') ||
      anchor.closest('[class*="note-content"]') ||
      anchor.parentElement ||
      document.body
    );
  }

  function isNodeVisible(el) {
    if (!el || !(el instanceof Element)) return false;
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity || '1') === 0) {
      return false;
    }
    const rect = el.getBoundingClientRect();
    return rect.width > 24 && rect.height > 24;
  }

  function isLivePhotoNote(root) {
    if (!root) return false;
    return Boolean(root.querySelector('img.live-img, .live-img.live-img-visible, [class*="live-img"]'));
  }

  function getCurrentStateNoteEntry() {
    try {
      const detailMap = getInitialState()?.note?.noteDetailMap || {};
      const keys = Object.keys(detailMap);
      if (keys.length === 0) return null;

      const candidates = [];
      const openedNoteId = getCurrentOpenedNoteId();
      if (openedNoteId) candidates.push(openedNoteId);
      const pathPart = location.pathname.split('/').filter(Boolean).pop() || '';
      if (pathPart) candidates.push(pathPart);
      try {
        const search = new URLSearchParams(location.search);
        ['noteId', 'note_id', 'id', 'itemId'].forEach((name) => {
          const value = search.get(name);
          if (value) candidates.push(value);
        });
      } catch {}

      const uniqCandidates = Array.from(new Set(candidates.filter(Boolean)));
      for (const candidate of uniqCandidates) {
        if (detailMap[candidate]) return detailMap[candidate];
        const matchedKey = keys.find((key) => key === candidate || key.includes(candidate) || candidate.includes(key));
        if (matchedKey) return detailMap[matchedKey];
        const matchedByEntry = keys.find((key) => {
          const entry = detailMap[key];
          const note = entry?.note || entry;
          const entryIds = [note?.noteId, note?.id, entry?.noteId, entry?.id]
            .filter(Boolean)
            .map((id) => String(id));
          return entryIds.some((id) => id === candidate || id.includes(candidate) || candidate.includes(id));
        });
        if (matchedByEntry) return detailMap[matchedByEntry];
      }

      const domTitle = normalizeTitle(getNoteTitle(getCurrentNoteRoot()));
      if (domTitle) {
        const titleMatchedKey = keys.find((key) => {
          const entry = detailMap[key];
          const note = entry?.note || entry;
          const entryTitle = normalizeTitle(note?.title || note?.noteTitle || '');
          return entryTitle && (entryTitle === domTitle || entryTitle.includes(domTitle) || domTitle.includes(entryTitle));
        });
        if (titleMatchedKey) return detailMap[titleMatchedKey];
      }

      if (keys.length === 1) return detailMap[keys[0]];
      return null;
    } catch {
      return null;
    }
  }

  function getCurrentStateNote() {
    const entry = getCurrentStateNoteEntry();
    return entry?.note || entry || null;
  }

  function isStateAlignedWithDomTitle(note) {
    if (!note) return false;
    const openedNoteId = getCurrentOpenedNoteId();
    const stateIds = [note?.noteId, note?.id, note?.note_id]
      .filter(Boolean)
      .map((id) => String(id).trim());
    if (openedNoteId && stateIds.length > 0) {
      return stateIds.some((id) => id === openedNoteId || id.includes(openedNoteId) || openedNoteId.includes(id));
    }
    const domTitle = normalizeTitle(getNoteTitle(getCurrentNoteRoot()));
    const stateTitle = normalizeTitle(note?.title || note?.noteTitle || '');
    if (domTitle && stateTitle) {
      return domTitle === stateTitle || domTitle.includes(stateTitle) || stateTitle.includes(domTitle);
    }
    if (domTitle && !stateTitle) return false;
    return true;
  }

  function pushUniqueUrl(list, value) {
    if (!value || typeof value !== 'string') return;
    const url = toAbsoluteUrl(value);
    if (!/^https?:\/\//i.test(url)) return;
    if (!list.includes(url)) {
      list.push(url);
    }
  }

  function getNoteTitle(root) {
    return (
      document.querySelector('#detail-title')?.innerText?.trim() ||
      root.querySelector('#detail-title')?.innerText?.trim() ||
      root.querySelector('.note-title')?.innerText?.trim() ||
      root.querySelector('.title')?.innerText?.trim() ||
      document.querySelector('meta[property="og:title"]')?.getAttribute('content') ||
      document.title ||
      '笔记'
    );
  }

  function getTextContent(root) {
    const textEls = Array.from(root.querySelectorAll('#detail-desc .note-text, .desc .note-text, .note-content .note-text'));
    const joined = textEls
      .map((el) => el.innerText?.trim())
      .filter(Boolean)
      .join('\n\n');
    if (joined) return joined;
    const metaDescription = document.querySelector('meta[property="og:description"]')?.getAttribute('content')
      || document.querySelector('meta[name="description"]')?.getAttribute('content')
      || '';
    return String(metaDescription || '').trim();
  }

  function getAuthor(root) {
    return (
      root.querySelector('.author .username')?.innerText?.trim() ||
      root.querySelector('.author-wrapper .username')?.innerText?.trim() ||
      root.querySelector('.username')?.innerText?.trim() ||
      '未知'
    );
  }

  function getAuthorProfileUrl(root) {
    const candidates = [
      root.querySelector('.author a[href*="/user/"]'),
      root.querySelector('.author-wrapper a[href*="/user/"]'),
      root.querySelector('a[href*="/user/"]'),
      document.querySelector('.author a[href*="/user/"]'),
      document.querySelector('a[href*="/user/"]'),
    ];
    for (const candidate of candidates) {
      const href = toAbsoluteUrl(candidate?.getAttribute?.('href') || '');
      if (href) return href;
    }
    return '';
  }

  function getAuthorId(root) {
    const link =
      root.querySelector('.author a[href*="/user/"], .author-wrapper a[href*="/user/"], a[href*="/user/profile"]') ||
      document.querySelector('.author a[href*="/user/"], .author-wrapper a[href*="/user/"], a[href*="/user/profile"]');
    const explicit = String(link?.getAttribute?.('data-user-id') || '').trim();
    if (explicit) return explicit;
    const href = String(link?.getAttribute?.('href') || '').trim();
    const match = href.match(/\/user\/profile\/([^/?#]+)/i);
    return match?.[1] || '';
  }

  function getAuthorAvatarUrl(root) {
    const img =
      root.querySelector('.author img, .author-wrapper img, .avatar img, img.avatar-item') ||
      document.querySelector('.author img, .author-wrapper img, .avatar img, img.avatar-item');
    return toAbsoluteUrl(img?.getAttribute?.('src') || img?.getAttribute?.('data-src') || '');
  }

  function getCurrentNoteImgEls(root) {
    const swiperSlides = getCurrentNoteSwiperSlides(root)
      .filter((slide) => !isDuplicateSwiperSlide(slide))
      .map((slide, domIndex) => ({
        slide,
        domIndex,
        slideIndex: Number.parseInt(slide.getAttribute('data-swiper-slide-index') || '', 10),
      }))
      .sort((a, b) => {
        const aHasIndex = Number.isFinite(a.slideIndex);
        const bHasIndex = Number.isFinite(b.slideIndex);
        if (aHasIndex && bHasIndex && a.slideIndex !== b.slideIndex) {
          return a.slideIndex - b.slideIndex;
        }
        if (aHasIndex !== bHasIndex) {
          return aHasIndex ? -1 : 1;
        }
        return a.domIndex - b.domIndex;
      });
    const swiperImgs = swiperSlides
      .map(({ slide }) => slide.querySelector('img'))
      .filter((img) => isValidNoteImageElement(img));
    if (swiperImgs.length > 0) {
      return swiperImgs;
    }

    const els = root
      ? Array.from(root.querySelectorAll('.img-container img, .note-content .img-container img, .swiper-slide img'))
      : Array.from(document.querySelectorAll('.note-content .img-container img, .img-container img, .swiper-slide img'));
    return els.filter((img) => isValidNoteImageElement(img));
  }

  function isDuplicateSwiperSlide(node) {
    return Boolean(node?.classList?.contains('swiper-slide-duplicate'));
  }

  function getCurrentNoteSwiperSlides(root) {
    const slides = root
      ? Array.from(root.querySelectorAll('.note-slider .swiper-slide, .swiper .swiper-slide'))
      : Array.from(document.querySelectorAll('#noteContainer .note-slider .swiper-slide, #noteContainer .swiper .swiper-slide, .note-container .note-slider .swiper-slide, .note-container .swiper .swiper-slide'));
    return slides.filter((slide) => !isCommentRelatedNode(slide));
  }

  function getNoteImageSrc(img) {
    return String(img?.getAttribute('src') || img?.getAttribute('data-src') || img?.currentSrc || '').trim();
  }

  function isValidNoteImageElement(img) {
    if (!img) return false;
    if (isCommentRelatedNode(img)) return false;
    if (img.closest('.avatar,[class*="avatar"]')) return false;
    if (img.closest('.swiper-slide-duplicate')) return false;
    return /^https?:\/\//i.test(getNoteImageSrc(img));
  }

  function getCurrentOriginalCoverImageUrl(root) {
    const swiperSlides = getCurrentNoteSwiperSlides(root).filter((slide) => !isDuplicateSwiperSlide(slide));
    const originalSlide = swiperSlides.find((slide) => String(slide.getAttribute('data-swiper-slide-index') || '').trim() === '0');
    const activeSlide = swiperSlides.find((slide) => slide.classList.contains('swiper-slide-active'));
    const fallbackSlide = swiperSlides[0] || null;
    const coverImg = originalSlide?.querySelector('img')
      || activeSlide?.querySelector('img')
      || fallbackSlide?.querySelector('img')
      || null;
    return isValidNoteImageElement(coverImg) ? getNoteImageSrc(coverImg) : null;
  }

  function parseCssBackgroundImageUrl(value) {
    const raw = String(value || '').trim();
    if (!raw || raw === 'none') return '';
    const match = raw.match(/url\((['"]?)(.*?)\1\)/i);
    return toAbsoluteUrl(match?.[2] || '');
  }

  function getElementBackgroundImageUrl(el) {
    if (!el) return '';
    const inlineUrl = parseCssBackgroundImageUrl(el.style?.backgroundImage || '');
    if (inlineUrl) return inlineUrl;
    try {
      return parseCssBackgroundImageUrl(window.getComputedStyle(el).backgroundImage);
    } catch {
      return '';
    }
  }

  function collectStateCoverUrls(stateNote) {
    const urls = [];
    const cover = stateNote?.cover || stateNote?.noteCard?.cover || null;
    const imageList = Array.isArray(stateNote?.imageList)
      ? stateNote.imageList
      : Array.isArray(stateNote?.images)
        ? stateNote.images
        : [];
    const coverInfoList = Array.isArray(cover?.infoList) ? cover.infoList : [];

    const pushCoverCandidate = (item) => {
      if (!item) return;
      if (typeof item === 'string') {
        pushUniqueUrl(urls, item);
        return;
      }
      pushUniqueUrl(urls, item?.urlDefault);
      pushUniqueUrl(urls, item?.urlPre);
      pushUniqueUrl(urls, item?.url);
      pushUniqueUrl(urls, item?.urlDefaultWebp);
      pushUniqueUrl(urls, item?.masterUrl);
      pushUniqueUrl(urls, item?.src);
    };

    pushCoverCandidate(cover?.urlDefault);
    pushCoverCandidate(cover?.urlPre);
    pushCoverCandidate(cover?.url);
    pushCoverCandidate(cover?.urlDefaultWebp);
    coverInfoList.forEach(pushCoverCandidate);
    imageList.forEach(pushCoverCandidate);

    return urls;
  }

  function getCurrentFeedCardCoverUrl(noteId) {
    const stableNoteId = String(noteId || '').trim();
    if (!stableNoteId) return '';

    const selectors = [
      `#exploreFeeds .note-item a.cover[href*="/explore/${stableNoteId}"] img`,
      `#exploreFeeds .note-item a.cover[href*="${stableNoteId}"] img`,
      `.feeds-container .note-item a.cover[href*="/explore/${stableNoteId}"] img`,
      `.feeds-container .note-item a.cover[href*="${stableNoteId}"] img`,
    ];

    for (const selector of selectors) {
      const img = document.querySelector(selector);
      const src = getNoteImageSrc(img);
      if (/^https?:\/\//i.test(src)) {
        return src;
      }
    }

    return '';
  }

  function getCurrentVideoPosterUrl(root, stateNote) {
    const mainVideo = getCurrentMainVideoElement(root);
    const directPoster = toAbsoluteUrl(
      mainVideo?.getAttribute('poster')
      || root?.querySelector?.('video')?.getAttribute?.('poster')
      || '',
    );
    if (/^https?:\/\//i.test(directPoster)) return directPoster;

    const posterEls = Array.from(root?.querySelectorAll?.('xg-poster.xgplayer-poster, .xgplayer xg-poster, .xgplayer-poster') || [])
      .filter((el) => !isCommentRelatedNode(el));
    const activePoster = posterEls.find((el) => el.classList?.contains?.('active') || isNodeVisible(el)) || posterEls[0] || null;
    const playerPoster = getElementBackgroundImageUrl(activePoster);
    if (/^https?:\/\//i.test(playerPoster)) return playerPoster;

    const feedCardPoster = getCurrentFeedCardCoverUrl(
      stateNote?.noteId
      || stateNote?.id
      || stateNote?.note_id
      || getCurrentOpenedNoteId(),
    );
    if (feedCardPoster) return feedCardPoster;

    const stateCoverUrl = collectStateCoverUrls(stateNote)[0] || '';
    if (stateCoverUrl) return stateCoverUrl;

    return '';
  }

  function getImageUrls(root, stateNote) {
    const urls = [];
    if (stateNote && isStateAlignedWithDomTitle(stateNote)) {
    const imageList = Array.isArray(stateNote?.imageList)
      ? stateNote.imageList
      : Array.isArray(stateNote?.images)
        ? stateNote.images
        : [];

    imageList.forEach((item) => {
      if (typeof item === 'string') {
        pushUniqueUrl(urls, item);
        return;
      }
      pushUniqueUrl(urls, item?.urlDefault);
      pushUniqueUrl(urls, item?.urlPre);
      pushUniqueUrl(urls, item?.url);
      pushUniqueUrl(urls, item?.urlDefaultWebp);
    });
    }

    if (urls.length > 0) return urls;

    const imgEls = getCurrentNoteImgEls(root);
    imgEls.forEach((img) => {
      pushUniqueUrl(urls, getNoteImageSrc(img));
    });
    return urls;
  }

  function getCurrentMainVideoElement(root) {
    if (!root) return null;
    const candidates = Array.from(root.querySelectorAll('video, video[mediatype="video"], .xgplayer video'));
    const visible = candidates.find((el) => !isCommentRelatedNode(el) && isNodeVisible(el));
    if (visible) return visible;
    const tagged = candidates.find((el) => {
      if (isCommentRelatedNode(el)) return false;
      if (el.getAttribute('mediatype') === 'video') return true;
      const src = (el.getAttribute('src') || '').trim();
      if (src.startsWith('blob:')) return true;
      if (/^https?:\/\//i.test(src)) return true;
      return Boolean(el.querySelector('source[src^="blob:"], source[src^="http"]'));
    });
    return tagged || null;
  }

  function getCurrentNoteVideoElements(root) {
    if (!root) return [];
    const candidates = Array.from(root.querySelectorAll('video, video[mediatype="video"], .xgplayer video'));
    const seen = new Set();
    const unique = [];
    candidates.forEach((el, index) => {
      if (isCommentRelatedNode(el)) return;
      const src = String(el.currentSrc || el.getAttribute('src') || '').trim();
      const poster = String(el.getAttribute('poster') || '').trim();
      const key = src || poster || `video-index-${index}`;
      if (seen.has(key)) return;
      seen.add(key);
      unique.push(el);
    });
    return unique;
  }

  function parseDurationTextToSeconds(value) {
    const raw = String(value || '').trim();
    if (!raw) return null;

    const numeric = Number(raw);
    if (Number.isFinite(numeric) && numeric > 0) {
      return numeric;
    }

    const parts = raw
      .split(':')
      .map((part) => Number(part.trim()))
      .filter((part) => Number.isFinite(part) && part >= 0);
    if (parts.length < 2 || parts.length > 3) return null;

    let seconds = 0;
    parts.forEach((part) => {
      seconds = (seconds * 60) + part;
    });
    return seconds > 0 ? seconds : null;
  }

  function getStateVideoDurationSeconds(stateNote) {
    const candidates = [
      stateNote?.video?.duration,
      stateNote?.video?.durationSeconds,
      stateNote?.video?.media?.duration,
      stateNote?.video?.media?.durationSeconds,
      stateNote?.video?.durationMs,
      stateNote?.video?.duration_ms,
      stateNote?.video?.media?.durationMs,
      stateNote?.video?.media?.duration_ms,
    ];

    for (const candidate of candidates) {
      const seconds = parseDurationTextToSeconds(candidate);
      if (!seconds) continue;
      return seconds > 10000 || (Number.isInteger(seconds) && seconds > 2000 && seconds % 1000 === 0)
        ? seconds / 1000
        : seconds;
    }

    return null;
  }

  function getNoteVideoDurationSeconds(videoEl, root, stateNote) {
    const directDuration = Number(videoEl?.duration);
    if (Number.isFinite(directDuration) && directDuration > 0) {
      return directDuration;
    }

    const scopes = [
      videoEl?.closest?.('.media-container'),
      videoEl?.closest?.('.player-container'),
      videoEl?.closest?.('.player-el'),
      videoEl?.closest?.('.xgplayer'),
      root,
      document,
    ].filter(Boolean);
    for (const scope of scopes) {
      const timeEls = Array.from(scope.querySelectorAll('xg-time span, .xgplayer-time span'));
      const parsed = parseDurationTextToSeconds(timeEls[timeEls.length - 1]?.textContent || '');
      if (parsed) return parsed;
    }

    return getStateVideoDurationSeconds(stateNote);
  }

  function resolveXhsNoteType(root, stateNote) {
    if (isLivePhotoNote(root)) {
      return 'image';
    }

    const videoElements = getCurrentNoteVideoElements(root);
    const hasStateVideo = Boolean(stateNote?.video);
    const videoCount = Math.max(videoElements.length, hasStateVideo ? 1 : 0);
    if (videoCount !== 1) {
      return 'image';
    }

    const mainVideo = getCurrentMainVideoElement(root) || videoElements[0] || null;
    const durationSeconds = getNoteVideoDurationSeconds(mainVideo, root, stateNote);
    if (durationSeconds == null) {
      return 'video';
    }

    return durationSeconds > 2 ? 'video' : 'image';
  }

  function collectDeepHttpUrls(input, maxCount = 40) {
    const urls = [];
    const seenObjects = new WeakSet();
    const seenUrls = new Set();

    function walk(value) {
      if (!value || urls.length >= maxCount) return;
      if (typeof value === 'string') {
        const trimmed = value.trim();
        if (/^https?:\/\//i.test(trimmed) && !seenUrls.has(trimmed)) {
          seenUrls.add(trimmed);
          urls.push(trimmed);
        }
        return;
      }
      if (typeof value !== 'object') return;
      if (seenObjects.has(value)) return;
      seenObjects.add(value);

      if (Array.isArray(value)) {
        for (const item of value) {
          walk(item);
          if (urls.length >= maxCount) break;
        }
        return;
      }

      for (const key of Object.keys(value)) {
        walk(value[key]);
        if (urls.length >= maxCount) break;
      }
    }

    walk(input);
    return urls;
  }

  function scoreVideoCandidate(url) {
    const normalized = String(url || '').toLowerCase();
    let score = 0;
    if (/\.mp4(\?|$)/.test(normalized)) score += 120;
    if (/\.m3u8(\?|$)/.test(normalized)) score += 80;
    if (/master/.test(normalized)) score += 25;
    if (/stream|video|media/.test(normalized)) score += 15;
    if (/sns-video|xiaohongshu|xhscdn|alicdn|byteimg/.test(normalized)) score += 10;
    return score;
  }

  function getPerformanceMediaUrls() {
    try {
      return performance.getEntriesByType('resource')
        .map((entry) => String(entry?.name || '').trim())
        .filter((url) => /^https?:\/\//i.test(url))
        .filter((url) => /(\.mp4|\.m3u8|video|stream|master)/i.test(url))
        .slice(-20);
    } catch {
      return [];
    }
  }

  function getCurrentNoteVideoUrls(root, stateNote) {
    const candidates = [];
    const h264 = stateNote?.video?.media?.stream?.h264 || [];
    const h265 = stateNote?.video?.media?.stream?.h265 || [];
    [...h264, ...h265].forEach((item) => {
      pushUniqueUrl(candidates, item?.masterUrl);
    });
    pushUniqueUrl(candidates, stateNote?.video?.media?.masterUrl);
    pushUniqueUrl(candidates, stateNote?.video?.media?.url);
    pushUniqueUrl(candidates, stateNote?.video?.url);
    collectDeepHttpUrls(stateNote?.video || stateNote, 80).forEach((url) => pushUniqueUrl(candidates, url));
    if (getCurrentMainVideoElement(root)) {
      getPerformanceMediaUrls().forEach((url) => pushUniqueUrl(candidates, url));
    }

    const videoEls = Array.from(root.querySelectorAll('video'));
    videoEls.forEach((videoEl) => {
      if (isCommentRelatedNode(videoEl)) return;
      pushUniqueUrl(candidates, videoEl?.src || '');
      const sourceEls = Array.from(videoEl.querySelectorAll('source'));
      sourceEls.forEach((source) => pushUniqueUrl(candidates, source?.src || ''));
    });

    return candidates.sort((a, b) => scoreVideoCandidate(b) - scoreVideoCandidate(a));
  }

  function captureVideoCoverDataUrl(root) {
    try {
      const videoEl = getCurrentMainVideoElement(root);
      if (!videoEl || !videoEl.videoWidth || !videoEl.videoHeight) return '';
      const canvas = document.createElement('canvas');
      canvas.width = videoEl.videoWidth;
      canvas.height = videoEl.videoHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) return '';
      ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL('image/jpeg', 0.92);
    } catch {
      return '';
    }
  }

  function getCoverUrl(root, images, noteType, stateNote) {
    if (noteType === 'video') {
      const poster = getCurrentVideoPosterUrl(root, stateNote);
      if (poster) return poster;
    }
    const originalCover = getCurrentOriginalCoverImageUrl(root);
    if (originalCover) return originalCover;
    const stateCoverUrl = collectStateCoverUrls(stateNote)[0] || '';
    if (stateCoverUrl) return stateCoverUrl;
    if (images[0]) return images[0];
    return toAbsoluteUrl(document.querySelector('meta[property="og:image"]')?.getAttribute('content') || '') || null;
  }

  function getStats() {
    const likeEl = Array.from(document.querySelectorAll('.like-wrapper .count,[class*="like-wrapper"] .count,[class*="like"] .count'))
      .find((el) => !el.closest('.comments-el') && !el.closest('[class*="comments-el"]'));
    const collectEl = Array.from(document.querySelectorAll('.collect-wrapper .count,[class*="collect-wrapper"] .count,[class*="collect"] .count'))
      .find((el) => !el.closest('.comments-el') && !el.closest('[class*="comments-el"]'));

    return {
      likes: parseCountText(likeEl?.innerText || ''),
      collects: parseCountText(collectEl?.innerText || ''),
    };
  }

  async function blobToDataUrl(blob) {
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(reader.error || new Error('Failed to read blob as data url'));
      reader.readAsDataURL(blob);
    });
  }

  async function fetchBinaryAsDataUrl(url, options = {}) {
    const target = String(url || '').trim();
    if (!target) return '';
    if (/^data:/i.test(target)) return target;
    if (!/^https?:\/\//i.test(target) && !/^blob:/i.test(target)) return '';
    if (/^https?:\/\//i.test(target) && options.http !== true) return '';
    try {
      const response = await fetch(target, {
        credentials: /^https?:\/\//i.test(target) ? 'omit' : 'same-origin',
        cache: 'force-cache',
      });
      if (!response.ok) return '';
      const blob = await response.blob();
      if (!blob || !blob.size) return '';
      if (blob.size > (options.maxBytes || inlineAssetMaxBytes)) return '';
      return await blobToDataUrl(blob);
    } catch {
      return '';
    }
  }

  const root = getCurrentNoteRoot();
  const stateNote = getCurrentStateNote();
  const title = String(getNoteTitle(root) || '').trim();
  const content = String(getTextContent(root) || '').trim();
  const images = getImageUrls(root, stateNote).slice(0, 9);
  const noteType = resolveXhsNoteType(root, stateNote);
  const videoCandidates = noteType === 'video' ? getCurrentNoteVideoUrls(root, stateNote) : [];
  const videoUrl = noteType === 'video' ? (videoCandidates[0] || null) : null;
  const coverUrl = getCoverUrl(root, images, noteType, stateNote);
  const capturedVideoCover = (!coverUrl && videoUrl) ? captureVideoCoverDataUrl(root) : '';

  const localizedImages = images.map((imageUrl) => String(imageUrl || '').trim()).filter(Boolean);

  const localizedCoverUrl = coverUrl
    ? (await fetchBinaryAsDataUrl(coverUrl)) || coverUrl
    : (capturedVideoCover || '');
  const localizedVideoDataUrl = videoUrl && String(videoUrl).startsWith('blob:')
    ? (await fetchBinaryAsDataUrl(videoUrl, { maxBytes: inlineAssetMaxBytes }))
    : '';
  const stableStateNoteId = String(
    stateNote?.noteId
    || stateNote?.id
    || stateNote?.note_id
    || getCurrentOpenedNoteId()
    || '',
  ).trim();
  const stablePathNoteId = String(location.pathname || '')
    .split('/')
    .filter(Boolean)
    .pop()
    || '';
  const stableNoteId = stableStateNoteId || stablePathNoteId || `xhs-${Date.now()}`;

  return {
    noteId: stableNoteId,
    noteType,
    title,
    author: getAuthor(root),
    content,
    text: content,
    images: localizedImages,
    coverUrl: localizedCoverUrl || coverUrl,
    videoUrl,
    videoDataUrl: localizedVideoDataUrl || '',
    stats: getStats(),
    source: location.href,
    authorId: getAuthorId(root),
    authorProfileUrl: getAuthorProfileUrl(root),
    authorAvatarUrl: getAuthorAvatarUrl(root),
  };
}


function extractXhsBloggerPayload(expectedProfileId = '') {
  function normalizeText(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function parseCountText(value) {
    const text = normalizeText(value).replace(/[\s,]/g, '').replace(/[^0-9.\u4e00-\u9fa5.]/g, '');
    if (!text) return 0;
    if (text.includes('万')) {
      const number = parseFloat(text.replace('万', ''));
      return Number.isNaN(number) ? 0 : Math.round(number * 10000);
    }
    if (text.includes('亿')) {
      const number = parseFloat(text.replace('亿', ''));
      return Number.isNaN(number) ? 0 : Math.round(number * 100000000);
    }
    const number = parseFloat(text);
    return Number.isNaN(number) ? 0 : Math.round(number);
  }

  function getInitialState() {
    const scripts = document.querySelectorAll('script');
    for (const script of scripts) {
      const text = script.textContent || '';
      if (!text.includes('window.__INITIAL_STATE__=')) continue;
      try {
        const jsonText = text
          .replace('window.__INITIAL_STATE__=', '')
          .replace(/undefined/g, 'null')
          .replace(/;$/, '');
        return JSON.parse(jsonText);
      } catch {
        return null;
      }
    }
    return null;
  }

  function unwrapValue(value) {
    if (!value || typeof value !== 'object') return value;
    if (value._rawValue && typeof value._rawValue === 'object') return value._rawValue;
    if (value.value && typeof value.value === 'object') return value.value;
    return value;
  }

  function pickImageUrl(value) {
    if (!value) return '';
    if (typeof value === 'string') return value;
    if (Array.isArray(value)) {
      for (const item of value) {
        const url = pickImageUrl(item);
        if (url) return url;
      }
      return '';
    }
    if (typeof value !== 'object') return '';
    return normalizeText(
      value.urlDefault ||
      value.urlPre ||
      value.url ||
      value.urlDefaultWebp ||
      value.src ||
      value.link ||
      '',
    );
  }

  const initialState = getInitialState();
  const stateUser = unwrapValue(initialState?.user?.userPageData)
    || unwrapValue(initialState?.user?.profile)
    || unwrapValue(initialState?.user?.userInfo)
    || {};
  const stateBasic = stateUser?.basic_info || stateUser?.basicInfo || stateUser;
  const stateUserId = normalizeText(stateUser.userId || stateUser.user_id || stateUser.id || stateBasic?.userId || stateBasic?.user_id);
  const expected = normalizeText(expectedProfileId);
  const isSearchOverlay = /^\/search_result(?:_ai)?\/?$/i.test(String(location.pathname || ''));
  if (isSearchOverlay && (!expected || stateUserId !== expected)) {
    throw new Error('Beav creator payload rejected: clicked profile ID does not match canonical XHS state user ID');
  }
  const userId = stateUserId || normalizeText(location.pathname.split('/').filter(Boolean).pop() || '');
  const profileRoot =
    document.querySelector('.user-page')
    || document.querySelector('.user-info')
    || document.querySelector('[class*="user-info"]')
    || document.querySelector('[class*="profile"]')
    || document.body;
  const nickname = normalizeText(
    stateUser.nickname ||
    stateUser.nickName ||
    stateUser.name ||
    document.querySelector('.user-name')?.textContent ||
    document.querySelector('[class*="user-name"]')?.textContent ||
    document.querySelector('[class*="nickname"]')?.textContent ||
    profileRoot.querySelector('h1, h2')?.textContent ||
    document.title.replace(/小红书.*/i, ''),
  );
  const description = normalizeText(
    stateUser.desc ||
    stateUser.description ||
    stateUser.userDesc ||
    document.querySelector('.user-desc')?.textContent ||
    document.querySelector('[class*="user-desc"]')?.textContent ||
    document.querySelector('[class*="desc"]')?.textContent ||
    '',
  );
  const avatar = normalizeText(
    pickImageUrl(stateUser.image) ||
    pickImageUrl(stateUser.avatar) ||
    pickImageUrl(stateUser.images) ||
    pickImageUrl(stateUser.imageb) ||
    document.querySelector('.avatar img')?.getAttribute('src') ||
    document.querySelector('[class*="avatar"] img')?.getAttribute('src') ||
    '',
  );
  const text = normalizeText(profileRoot.innerText || profileRoot.textContent || '');
  const readMetric = (label) => {
    const after = text.match(new RegExp(`${label}\\s*[:：]?\\s*([0-9.万亿]+)`));
    const before = text.match(new RegExp(`([0-9.万亿]+)\\s*${label}`));
    return after?.[1] || before?.[1] || '';
  };
  const fansText = readMetric('粉丝') || stateUser.fans || stateUser.fansCount || stateBasic.fans || stateBasic.fansCount || '';
  const followsText = readMetric('关注') || stateUser.follows || stateUser.followingCount || stateBasic.follows || stateBasic.followingCount || '';
  const likedText = readMetric('获赞与收藏') || readMetric('获赞') || stateUser.liked || stateUser.likedCount || stateBasic.liked || stateBasic.likedCount || '';
  const publicXhsId = normalizeText(
    stateUser.xhsId || stateUser.xhs_id || stateUser.redId || stateUser.red_id
    || stateBasic.xhsId || stateBasic.xhs_id || stateBasic.redId || stateBasic.red_id
    || (text.match(/小红书号\s*[:：]?\s*([A-Za-z0-9_-]+)/i) || [])[1] || '',
  );

  return {
    userId: normalizeText(stateUser.userId || stateUser.user_id || stateUser.id || stateBasic.userId || stateBasic.user_id || stateBasic.id || userId),
    xhsId: publicXhsId,
    nickname,
    description,
    avatar,
    stats: {
      fans: parseCountText(fansText),
      follows: parseCountText(followsText),
      liked: parseCountText(likedText),
    },
    source: location.href,
  };
}


export { extractXhsNotePayload, extractXhsBloggerPayload };
