/* Redbook-owned, shell-independent policy for the search-profile companion. */
const CLICK_TTL_MS = 10_000;

function normalizeOverlayClick(payload, now = Date.now()) {
  const profileId = String(payload?.profileId || '').trim();
  const pathname = String(payload?.pathname || '');
  const observedAt = Number(payload?.observedAt);
  if (!/^[A-Za-z0-9_-]+$/.test(profileId) || pathname !== `/user/profile/${profileId}` || !Number.isFinite(observedAt) || Math.abs(now - observedAt) > CLICK_TTL_MS) return null;
  return { profileId, pathname, observedAt, generation: Number(payload?.generation) || 0 };
}

function knownStateIdentity(state) {
  const unwrap = (value) => value?._rawValue && typeof value._rawValue === 'object' ? value._rawValue : value?.value && typeof value.value === 'object' ? value.value : value;
  const branches = [
    ['user.userPageData', state?.user?.userPageData],
    ['user.profile', state?.user?.profile],
    ['user.userInfo', state?.user?.userInfo],
  ];
  for (const [branch, value] of branches) {
    const raw = unwrap(value);
    if (!raw || typeof raw !== 'object') continue;
    const basic = raw.basic_info || raw.basicInfo || raw;
    const userId = String(raw.userId || raw.user_id || raw.id || basic.userId || basic.user_id || '').trim();
    if (!userId) continue;
    return { branch, userId, nickname: String(raw.nickname || raw.nickName || basic.nickname || basic.nickName || '').trim() || null };
  }
  return null;
}

function bindOverlayClickToState(click, state, confirmedAt = new Date().toISOString()) {
  const identity = knownStateIdentity(state);
  if (!click || !identity || identity.userId !== click.profileId) return { confirmed: false };
  return { confirmed: true, profileId: click.profileId, pathname: click.pathname, nickname: identity.nickname, confirmedAt };
}

module.exports = { CLICK_TTL_MS, normalizeOverlayClick, knownStateIdentity, bindOverlayClickToState };
