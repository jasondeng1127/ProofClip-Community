export function normalizeHttpsOrigin(value) {
  if (typeof value !== 'string' || value.trim() !== value || value.length === 0) {
    throw new TypeError('A valid HTTPS origin is required');
  }

  let url;
  try {
    url = new URL(value);
  } catch {
    throw new TypeError('A valid HTTPS origin is required');
  }

  if (
    url.protocol !== 'https:' ||
    !url.hostname ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  ) {
    throw new TypeError('A valid HTTPS origin without a path, query, fragment, or credentials is required');
  }
  return url.origin.toLowerCase();
}

export function buildNotionRedirectUri(origin) {
  return `${normalizeHttpsOrigin(origin)}/v1/auth/notion/callback`;
}

export function patchCommunityOrigin(configText, origin) {
  if (typeof configText !== 'string') throw new TypeError('Community config text is required');
  const normalizedOrigin = normalizeHttpsOrigin(origin);
  const pattern = /(export\s+const\s+COMMUNITY_API_ORIGIN\s*=\s*)(['"])([^'"\r\n]*)(['"])(\s*;)/;
  const match = configText.match(pattern);
  if (!match || match[2] !== match[4] || (configText.match(/COMMUNITY_API_ORIGIN/g) || []).length !== 1) {
    throw new Error('Community config must contain exactly one COMMUNITY_API_ORIGIN string');
  }
  return configText.replace(pattern, `${match[1]}${match[2]}${normalizedOrigin}${match[4]}${match[5]}`);
}
