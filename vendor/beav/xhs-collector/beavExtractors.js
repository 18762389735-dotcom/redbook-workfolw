/*
 * Highly derived from Jamailar/Beav Plugin/src/background.js:
 * extractXhsBloggerPayload and extractXhsBloggerNotesPayload.
 * Upstream: https://github.com/Jamailar/Beav
 * License: ../LICENSE (MIT License - Non-Commercial Use Only).
 * Local changes: limit baseline collection to 12 by default / 20 maximum,
 * preserve unknown metrics as null, retain only observed DOM/API URLs, and
 * remove all unrelated Desktop/RedClaw integration.
 */

export function extractVisibleContext() {
  const linksByNote = new Map();
  for (const anchor of document.querySelectorAll('a[href*="/explore/"], a[href*="/discovery/item/"]')) {
    const observed = anchor.getAttribute('href') || anchor.href || '';
    let url;
    try { url = new URL(observed, location.href); } catch { continue; }
    if (!/(^|\.)(xiaohongshu\.com|rednote\.com)$/i.test(url.hostname)) continue;
    const match = url.pathname.match(/\/(?:explore|discovery\/item)\/([A-Za-z0-9]+)/);
    if (!match?.[1] || linksByNote.has(match[1])) continue;
    linksByNote.set(match[1], url.toString());
  }
  const visit = (value, seen = new WeakSet()) => {
    if (!value || typeof value !== 'object' || seen.has(value)) return;
    seen.add(value);
    const card = value.note_card || value.noteCard || value.note || value;
    const noteId = String(card.note_id || card.noteId || card.id || '');
    if (noteId && !linksByNote.has(noteId)) {
      const explicit = card.url || card.note_url || card.noteUrl;
      const token = card.xsec_token || card.xsecToken || card.xsecTokenDetail;
      if (explicit) {
        try { linksByNote.set(noteId, new URL(explicit, location.href).toString()); } catch { /* invalid observed URL */ }
      } else if (token) {
        const observed = new URL(`/explore/${noteId}`, location.origin);
        observed.searchParams.set('xsec_token', String(token));
        const source = card.xsec_source || card.xsecSource;
        if (source) observed.searchParams.set('xsec_source', String(source));
        linksByNote.set(noteId, observed.toString());
      }
    }
    for (const child of Object.values(value)) visit(child, seen);
  };
  for (const record of window.__REDBOX_XHS_RESPONSES__ || []) visit(record?.result);
  const current = new URL(location.href);
  return {
    links: [...linksByNote].map(([noteId, url]) => ({ noteId, url })),
    keyword: /^\/search_result\/?$/i.test(current.pathname) ? current.searchParams.get('keyword') || null : null,
    pageUrl: current.toString(),
  };
}

// Derived only from Beav's safe readFeedFromStore path inside
// extractXhsNoteFeedByUrlFromCurrentPage. This function never signs or sends a
// request and never reads cookies; it waits for a response the XHS page itself
// has already made and xhsBridge has observed.
export async function extractObservedNoteFeed(noteIdInput, timeoutInput = 6000) {
  const noteId = String(noteIdInput || '').trim();
  const timeout = Math.min(10000, Math.max(1000, Number(timeoutInput) || 6000));
  const started = Date.now();
  while (Date.now() - started < timeout) {
    const store = Array.isArray(window.__REDBOX_XHS_RESPONSES__) ? window.__REDBOX_XHS_RESPONSES__ : [];
    for (let index = store.length - 1; index >= 0; index -= 1) {
      const record = store[index];
      let parsed;
      try { parsed = new URL(record?.url || '', location.href); } catch { continue; }
      if (parsed.pathname !== '/api/sns/web/v1/feed') continue;
      const data = record?.result?.data || record?.result?.result?.data || record?.result;
      const items = Array.isArray(data?.items) ? data.items : [];
      for (const item of items) {
        const card = item?.note_card || item?.noteCard;
        const currentId = String(card?.note_id || card?.noteId || '');
        if (currentId === noteId) return JSON.parse(JSON.stringify(card));
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 350));
  }
  return null;
}

export function extractXhsBloggerPayload() {
  const normalizeText = (value) => String(value || '').replace(/\s+/g, ' ').trim();
  const parseCountText = (value) => {
    const text = normalizeText(value).replace(/[\s,]/g, '');
    const match = text.match(/^(\d+(?:\.\d+)?)(万|亿)?$/);
    if (!match) return null;
    const multiplier = match[2] === '万' ? 10000 : match[2] === '亿' ? 100000000 : 1;
    const result = Number(match[1]) * multiplier;
    return Number.isSafeInteger(result) && result >= 0 ? result : null;
  };
  const unwrap = (value) => value?._rawValue && typeof value._rawValue === 'object' ? value._rawValue : value?.value && typeof value.value === 'object' ? value.value : value;
  const image = (value) => {
    if (!value) return '';
    if (typeof value === 'string') return value;
    if (Array.isArray(value)) return value.map(image).find(Boolean) || '';
    return normalizeText(value.urlDefault || value.urlPre || value.url || value.urlDefaultWebp || value.src || value.link);
  };
  const readState = () => {
    if (window.__INITIAL_STATE__ && typeof window.__INITIAL_STATE__ === 'object') return window.__INITIAL_STATE__;
    for (const script of document.scripts) {
      const text = script.textContent || '';
      if (!text.includes('window.__INITIAL_STATE__=')) continue;
      try { return JSON.parse(text.replace('window.__INITIAL_STATE__=', '').replace(/undefined/g, 'null').replace(/;$/, '')); } catch { return null; }
    }
    return null;
  };
  if (!/^\/user\/profile\//i.test(location.pathname)) throw new Error('当前页面不是小红书博主页');
  const state = readState();
  const raw = unwrap(state?.user?.userPageData) || unwrap(state?.user?.profile) || unwrap(state?.user?.userInfo) || {};
  const basic = raw.basic_info || raw.basicInfo || raw;
  const root = document.querySelector('.user-page, .user-info, [class*="user-info"], [class*="profile"]') || document.body;
  const pageText = normalizeText(root.innerText || root.textContent);
  const matchCount = (labels) => {
    for (const label of labels) {
      const match = pageText.match(new RegExp(`${label}\\s*([0-9.,万亿]+)`));
      if (match) return match[1];
    }
    return null;
  };
  const userId = normalizeText(raw.userId || raw.user_id || raw.id || basic.userId || basic.user_id || location.pathname.split('/').filter(Boolean).pop());
  if (!userId) throw new Error('未识别到小红书博主 ID');
  return {
    userId,
    nickname: normalizeText(raw.nickname || raw.nickName || basic.nickname || basic.nickName || document.querySelector('.user-name, [class*="user-name"], [class*="nickname"]')?.textContent || document.title.replace(/小红书.*/i, '')),
    description: normalizeText(raw.desc || raw.description || raw.userDesc || basic.desc || document.querySelector('.user-desc, [class*="user-desc"]')?.textContent),
    avatar: normalizeText(image(raw.image || raw.avatar || basic.image || basic.avatar) || document.querySelector('.avatar img, [class*="avatar"] img')?.getAttribute('src')),
    stats: {
      fans: parseCountText(raw.fans ?? raw.fansCount ?? basic.fans ?? matchCount(['粉丝'])),
      follows: parseCountText(raw.follows ?? raw.followingCount ?? basic.follows ?? matchCount(['关注'])),
      liked: parseCountText(raw.liked ?? raw.likedCount ?? basic.liked ?? matchCount(['获赞与收藏', '获赞'])),
    },
    source: location.href,
  };
}

export async function extractXhsBloggerNotesPayload(limitInput = 12, modeInput = 'auto') {
  const normalizeText = (value) => String(value || '').replace(/\s+/g, ' ').trim();
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const unwrap = (value) => value?._rawValue && typeof value._rawValue === 'object' ? value._rawValue : value?.value && typeof value.value === 'object' ? value.value : value;
  const image = (value) => {
    if (!value) return '';
    if (typeof value === 'string') return value;
    if (Array.isArray(value)) return value.map(image).find(Boolean) || '';
    return normalizeText(value.urlDefault || value.urlPre || value.url || value.url_default || value.url_pre || value.src);
  };
  const readState = () => {
    if (window.__INITIAL_STATE__ && typeof window.__INITIAL_STATE__ === 'object') return window.__INITIAL_STATE__;
    for (const script of document.scripts) {
      const text = script.textContent || '';
      if (!text.includes('window.__INITIAL_STATE__=')) continue;
      try { return JSON.parse(text.replace('window.__INITIAL_STATE__=', '').replace(/undefined/g, 'null').replace(/;$/, '')); } catch { return null; }
    }
    return null;
  };
  const limit = Math.min(20, Math.max(1, Math.round(Number(limitInput) || 12)));
  const state = readState();
  const rawProfile = unwrap(state?.user?.userPageData) || unwrap(state?.user?.profile) || unwrap(state?.user?.userInfo) || {};
  const basic = rawProfile.basic_info || rawProfile.basicInfo || rawProfile;
  const profile = {
    userId: normalizeText(rawProfile.userId || rawProfile.user_id || rawProfile.id || basic.userId || basic.user_id || location.pathname.split('/').filter(Boolean).pop()),
    nickname: normalizeText(rawProfile.nickname || rawProfile.nickName || basic.nickname || basic.nickName || document.title.replace(/小红书.*/i, '')),
  };
  if (!/^\/user\/profile\//i.test(location.pathname)) throw new Error('当前页面不是小红书博主页');
  if (!profile.userId) throw new Error('未识别到小红书博主 ID');

  const notes = [];
  const seen = new Map();
  const plain = (value) => { try { return JSON.parse(JSON.stringify(value)); } catch { return {}; } };
  const push = (rawItems, observedUrl = null) => {
    for (const item of Array.isArray(rawItems) ? rawItems : []) {
      const note = unwrap(item?.noteCard) || unwrap(item?.note_card) || unwrap(item);
      const noteId = normalizeText(note?.note_id || note?.noteId || note?.id);
      if (!noteId) continue;
      const token = normalizeText(note?.xsec_token || note?.xsecToken || note?.xsecTokenDetail);
      let url = observedUrl;
      if (!url) {
        const candidate = new URL(`/explore/${noteId}`, location.origin);
        if (token) candidate.searchParams.set('xsec_token', token);
        const source = normalizeText(note?.xsec_source || note?.xsecSource);
        if (source) candidate.searchParams.set('xsec_source', source);
        url = candidate.toString();
      }
      const candidate = { noteId, title: normalizeText(note?.display_title || note?.displayTitle || note?.title), type: normalizeText(note?.type), coverUrl: image(note?.cover || note?.image || note?.images), url, raw: plain(note) };
      if (seen.has(noteId)) {
        const index = seen.get(noteId);
        const previous = notes[index];
        notes[index] = { ...previous, title: candidate.title || previous.title, type: candidate.type || previous.type, coverUrl: candidate.coverUrl || previous.coverUrl, url: observedUrl || previous.url || candidate.url, raw: { ...previous.raw, ...candidate.raw } };
        continue;
      }
      seen.set(noteId, notes.length);
      notes.push(candidate);
      if (notes.length >= limit) break;
    }
  };
  const pushObservedAnchor = (anchor) => {
    let observed;
    try { observed = new URL(anchor.getAttribute('href') || anchor.href, location.href); } catch { return; }
    const match = observed.pathname.match(/\/(?:explore|discovery\/item)\/([A-Za-z0-9]+)/);
    if (!match?.[1]) return;
    const card = anchor.closest('section, [class*="note-item"], [class*="feed-card"]') || anchor.parentElement;
    const likeText = normalizeText(card?.querySelector('.like-wrapper .count, [class*="like-wrapper"] [class*="count"], [class*="like-wrapper"] span')?.textContent);
    push([{
      note_id: match[1],
      display_title: anchor.querySelector('[class*="title"], .title')?.textContent || card?.querySelector('[class*="title"], .title')?.textContent || anchor.textContent,
      ...(likeText ? { interact_info: { liked_count: likeText } } : {}),
    }], observed.toString());
  };
  const stateNotes = unwrap(state?.user?.notes);
  for (const group of Array.isArray(stateNotes) ? stateNotes : []) push(Array.isArray(unwrap(group)) ? unwrap(group) : [unwrap(group)]);
  for (const anchor of document.querySelectorAll('a[href*="/explore/"], a[href*="/discovery/item/"]')) pushObservedAnchor(anchor);
  for (const record of [...(window.__REDBOX_XHS_RESPONSES__ || [])].reverse()) {
    let parsed;
    try { parsed = new URL(record?.url || '', location.href); } catch { continue; }
    if (parsed.pathname !== '/api/sns/web/v1/user_posted') continue;
    if (parsed.searchParams.get('user_id') && parsed.searchParams.get('user_id') !== profile.userId) continue;
    const data = record?.result?.data || record?.result?.result?.data || record?.result;
    push(data?.notes);
  }

  let cursor = '';
  let hasMore = true;
  let apiError = '';
  let apiPages = 0;
  if (modeInput !== 'rpa') {
    try {
      while (notes.length < limit && hasMore) {
        const url = new URL('/api/sns/web/v1/user_posted', location.origin);
        url.searchParams.set('user_id', profile.userId);
        url.searchParams.set('cursor', cursor);
        url.searchParams.set('num', '20');
        url.searchParams.set('image_formats', 'jpg,webp,avif');
        const pageUrl = new URL(location.href);
        for (const key of ['xsec_token', 'xsec_source']) if (pageUrl.searchParams.get(key)) url.searchParams.set(key, pageUrl.searchParams.get(key));
        const response = await fetch(url, { credentials: 'include', headers: { accept: 'application/json, text/plain, */*' } });
        if (!response.ok) throw new Error(`user_posted HTTP ${response.status}`);
        const json = await response.json();
        const data = json?.data || json?.result?.data || json;
        const pageNotes = Array.isArray(data?.notes) ? data.notes : [];
        push(pageNotes);
        apiPages += 1;
        cursor = normalizeText(data?.cursor);
        hasMore = data?.has_more !== false && data?.hasMore !== false && pageNotes.length > 0;
        if (!cursor && !pageNotes.length) break;
        await sleep(280);
      }
    } catch (error) { apiError = error instanceof Error ? error.message : String(error); }
  }
  if (modeInput === 'rpa' || notes.length < limit || apiError) {
    let stagnant = 0;
    let previous = notes.length;
    for (let round = 0; round < 10 && notes.length < limit && stagnant < 4; round += 1) {
      window.scrollTo(0, document.documentElement.scrollHeight);
      await sleep(850);
      for (const anchor of document.querySelectorAll('a[href*="/explore/"], a[href*="/discovery/item/"]')) pushObservedAnchor(anchor);
      stagnant = notes.length > previous ? 0 : stagnant + 1;
      previous = notes.length;
    }
  }
  return { ...profile, source: location.href, collectionMode: apiPages > 0 ? 'api' : 'rpa', apiError, loadedNoteCount: notes.length, notes: notes.slice(0, limit), urls: notes.slice(0, limit).map((item) => item.url) };
}
