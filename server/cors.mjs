function configuredOrigins(value = process.env.REDBOOK_ALLOWED_ORIGINS || '') {
  const values = Array.isArray(value) ? value : String(value).split(',');
  return new Set(values.map((origin) => String(origin).trim()).filter(Boolean));
}

function normalizeHost(host) {
  return typeof host === 'string' ? host.trim().toLowerCase() : '';
}

export function createCorsPolicy({ production = false, allowedOrigins, sameOrigin, allowedHost } = {}) {
  const exactOrigins = configuredOrigins(allowedOrigins);
  const expectedOrigin = typeof sameOrigin === 'string' ? sameOrigin.trim() : '';
  const expectedHost = normalizeHost(allowedHost);
  const allowExtensionScheme = !production && process.env.REDBOOK_DEV_ALLOW_EXTENSION_CORS === '1';
  const isAllowedOrigin = (origin) => {
    if (!origin) return false;
    const normalized = String(origin).trim();
    if (production) return Boolean(expectedOrigin) && normalized === expectedOrigin;
    if (exactOrigins.has(normalized)) return true;
    return allowExtensionScheme && /^chrome-extension:\/\/[a-z0-9-]+$/i.test(normalized);
  };
  const isAllowedHost = (host) => !production || (Boolean(expectedHost) && normalizeHost(host) === expectedHost);
  const isAllowedRequest = (request) => {
    if (!isAllowedHost(request.headers.host)) return false;
    const origin = request.headers.origin;
    return !origin || isAllowedOrigin(origin);
  };
  return {
    isAllowedOrigin,
    isAllowedHost,
    isAllowedRequest,
    headers(request) {
      const origin = request.headers.origin;
      if (!origin || !isAllowedOrigin(origin)) return {};
      return { 'access-control-allow-origin': String(origin).trim(), vary: 'Origin' };
    },
  };
}

/**
 * Remove legacy wildcard headers emitted by individual API handlers and apply
 * one origin policy at the HTTP boundary. Every request with an Origin is
 * rejected before the handler unless that exact Origin is approved. This is
 * intentionally enforced for simple requests too; hiding ACAO is not an
 * authorization boundary.
 */
export function enforceCors(request, response, policy) {
  if (!policy.isAllowedRequest(request)) {
    response.writeHead(403, { 'content-type': 'application/json; charset=utf-8' });
    response.end(JSON.stringify({ error: '请求来源或 Host 不被允许' }));
    return true;
  }
  const writeHead = response.writeHead.bind(response);
  response.writeHead = (status, headers, ...rest) => {
    const safeHeaders = { ...(headers || {}) };
    for (const key of Object.keys(safeHeaders)) {
      if (key.toLowerCase() === 'access-control-allow-origin') delete safeHeaders[key];
    }
    Object.assign(safeHeaders, policy.headers(request));
    return writeHead(status, safeHeaders, ...rest);
  };
  return false;
}
