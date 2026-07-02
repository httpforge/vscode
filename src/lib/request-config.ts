import type { EnvVariable } from '../domain';
import type { KeyValueRow, RequestConfig } from '../domain/request-config';
import { resolveEnvVars } from './request-utils';

function enabledRows(rows: KeyValueRow[]): KeyValueRow[] {
  return rows.filter((r) => r.enabled && r.key.trim());
}

function resolveRow(rows: KeyValueRow[], vars: EnvVariable[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const row of enabledRows(rows)) {
    out[resolveEnvVars(row.key, vars).trim()] = resolveEnvVars(row.value, vars);
  }
  return out;
}

function appendQueryParams(url: string, params: Record<string, string>): string {
  if (Object.keys(params).length === 0) return url;
  const parsed = new URL(url);
  for (const [key, value] of Object.entries(params)) {
    parsed.searchParams.set(key, value);
  }
  return parsed.toString();
}

function buildAuthHeaders(auth: RequestConfig['auth'], vars: EnvVariable[]): Record<string, string> {
  const headers: Record<string, string> = {};
  const type = auth.type;

  if (type === 'bearer' || type === 'jwt-bearer') {
    const token = resolveEnvVars(auth.bearerToken, vars).trim();
    if (token) headers.Authorization = `Bearer ${token}`;
  } else if (type === 'basic') {
    const user = resolveEnvVars(auth.basicUsername, vars);
    const pass = resolveEnvVars(auth.basicPassword, vars);
    if (user || pass) {
      headers.Authorization = `Basic ${Buffer.from(`${user}:${pass}`).toString('base64')}`;
    }
  } else if (type === 'oauth2') {
    const token = resolveEnvVars(auth.oauthToken, vars).trim();
    if (token) headers.Authorization = `Bearer ${token}`;
  } else if (type === 'api-key' && auth.apiKeyIn === 'header') {
    const name = auth.apiKeyName.trim();
    const value = resolveEnvVars(auth.apiKeyValue, vars).trim();
    if (name && value) headers[name] = value;
  }

  return headers;
}

function buildAuthQueryParams(auth: RequestConfig['auth'], vars: EnvVariable[]): Record<string, string> {
  if (auth.type !== 'api-key' || auth.apiKeyIn !== 'query') return {};
  const name = auth.apiKeyName.trim();
  const value = resolveEnvVars(auth.apiKeyValue, vars).trim();
  if (!name || !value) return {};
  return { [name]: value };
}

function buildCookieHeader(cookies: KeyValueRow[], vars: EnvVariable[]): string | undefined {
  const pairs = enabledRows(cookies)
    .map((r) => `${r.key.trim()}=${resolveEnvVars(r.value, vars)}`)
    .filter(Boolean);
  return pairs.length > 0 ? pairs.join('; ') : undefined;
}

function buildBody(config: RequestConfig, vars: EnvVariable[]): { body?: string; headers: Record<string, string> } {
  const headers: Record<string, string> = {};
  if (config.bodyType === 'none') return { headers };

  const raw = resolveEnvVars(config.body, vars);
  if (config.bodyType === 'json') {
    headers['Content-Type'] = 'application/json';
    return { body: raw, headers };
  }
  if (config.bodyType === 'text') {
    headers['Content-Type'] = 'text/plain';
    return { body: raw, headers };
  }
  if (config.bodyType === 'xml') {
    const contentType = config.soapContentType ?? 'text/xml';
    headers['Content-Type'] = `${contentType}; charset=utf-8`;
    const soapAction = resolveEnvVars(config.soapAction ?? '', vars).trim();
    if (soapAction) headers.SOAPAction = `"${soapAction}"`;
    return { body: raw, headers };
  }
  if (config.bodyType === 'form-urlencoded') {
    headers['Content-Type'] = 'application/x-www-form-urlencoded';
    try {
      const data = JSON.parse(raw || '{}') as Record<string, string>;
      const body = new URLSearchParams(data).toString();
      return { body, headers };
    } catch {
      return { body: raw, headers };
    }
  }

  return { headers };
}

export function buildExecutionPayload(
  config: RequestConfig,
  method: string,
  url: string,
  vars: EnvVariable[]
): { url: string; headers: Record<string, string>; body?: string } {
  const resolvedUrl = resolveEnvVars(url, vars);
  const queryParams = {
    ...resolveRow(config.params, vars),
    ...buildAuthQueryParams(config.auth, vars),
  };
  const finalUrl = appendQueryParams(resolvedUrl, queryParams);

  const headers: Record<string, string> = {
    ...resolveRow(config.headers, vars),
    ...buildAuthHeaders(config.auth, vars),
  };

  const cookieHeader = buildCookieHeader(config.cookies, vars);
  if (cookieHeader) headers.Cookie = cookieHeader;

  const bodyResult = buildBody(config, vars);
  Object.assign(headers, bodyResult.headers);

  const upper = method.toUpperCase();
  const body = ['GET', 'HEAD'].includes(upper) ? undefined : bodyResult.body;

  return { url: finalUrl, headers, body };
}

export function hasUnresolvedVars(text: string): boolean {
  return listUnresolvedVars(text).length > 0;
}

export function listUnresolvedVars(text: string): string[] {
  const names: string[] = [];
  const re = /\{\{([^}]+)\}\}/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    names.push(match[1].trim());
  }
  return names;
}
