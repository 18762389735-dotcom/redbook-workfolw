function configuredOrigins(value = process.env.REDBOOK_ALLOWED_ORIGINS || '') {
  return new Set(String(value).split(',').map((origin) => origin.trim()).filter(Boolean));
}

export function createCorsPolicy({ production = false, allowedOrigins } = {}) {
  const exactOrigins = configuredOrigins(allowedOrigins);
  const allowExtensionScheme = !production && process.env.REDBOOK_DEV_ALLOW_EXTENSION_CORS === '1';
  const isAllowedOrigin = (origin) => {
    if (!origin) return false;
    if (exactOrigins.has(origin)) return true;
    return allowExtensionScheme && /^chrome-extension:\/\/[a-z0-9-]+$/i.test(origin);
  };
  return {
    isAllowedOrigin,
    headers(request) {
      const origin = request.headers.origin;
      if (!isAllowedOrigin(origin)) return {};
      return { 'access-control-allow-origin': origin, vary: 'Origin' };
    },
  };
}

/**
 * Remove legacy wildcard headers emitted by individual API handlers and apply
 * one origin policy at the HTTP boundary. An unapproved preflight is rejected
 * before the handler can return a permissive response.
 */
export function enforceCors(request, response, policy) {
  const origin = request.headers.origin;
  if (request.method === 'OPTIONS' && origin && !policy.isAllowedOrigin(origin)) {
    response.writeHead(403, { 'content-type': 'application/json; charset=utf-8' });
    response.end(JSON.stringify({ error: 'Origin 不被允许' }));
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
