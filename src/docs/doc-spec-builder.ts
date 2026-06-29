import type { CollectionDto, ProjectFull } from '../db/project-repository';
import type { ExportEnvironment } from '../export/export-service';
import { parseRequestConfig, type RequestAuth } from '../domain/request-config';

export interface DocKeyValue {
  key: string;
  value: string;
  description?: string;
}

export interface DocAuthorization {
  type: string;
  label: string;
  fields: DocKeyValue[];
  note?: string;
}

export interface DetailedDocEndpoint {
  id: string;
  tag: string;
  name: string;
  method: string;
  url: string;
  path: string;
  headers: DocKeyValue[];
  queryParams: DocKeyValue[];
  authorization: DocAuthorization;
  bodyType: string;
  requestBody: string;
  authType: string;
  authSummary: string;
  requestExample: string;
  responseExample: string;
}

export interface ApiDocumentation {
  title: string;
  description: string;
  version: string;
  environments: ExportEnvironment[];
  baseUrl: string;
  endpoints: DetailedDocEndpoint[];
}

function resolveVars(text: string, variables: Record<string, string>): string {
  return text.replace(/\{\{([^}]+)\}\}/g, (_, key: string) => variables[key.trim()] ?? `{{${key.trim()}}}`);
}

function extractPath(url: string): string {
  let path = url.trim();
  // Strip leading base-url placeholder(s), e.g. {{BASE_URL}}/users → /users
  path = path.replace(/^\{\{[^}]+\}\}/, '');
  path = path.replace(/^https?:\/\/[^/?#]+/, '');
  if (!path) return '/';
  return path.startsWith('/') ? path : `/${path}`;
}

function enabledRows(
  rows: { key: string; value: string; description?: string; enabled?: boolean }[]
): DocKeyValue[] {
  return rows
    .filter((r) => r.key?.trim() && r.enabled !== false)
    .map((r) => ({
      key: r.key.trim(),
      value: r.value ?? '',
      ...(r.description?.trim() ? { description: r.description.trim() } : {}),
    }));
}

function appendQueryParams(url: string, params: DocKeyValue[]): string {
  if (!params.length) return url;
  try {
    const parsed = new URL(url.includes('://') ? url : `https://example.com${url.startsWith('/') ? url : `/${url}`}`);
    for (const p of params) {
      parsed.searchParams.set(p.key, p.value);
    }
    if (url.includes('://')) return parsed.toString();
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    const qs = params.map((p) => `${encodeURIComponent(p.key)}=${encodeURIComponent(p.value)}`).join('&');
    return url.includes('?') ? `${url}&${qs}` : `${url}?${qs}`;
  }
}

const AUTH_LABELS: Record<string, string> = {
  none: 'No Auth',
  bearer: 'Bearer Token',
  'jwt-bearer': 'JWT Bearer',
  basic: 'Basic Auth',
  digest: 'Digest Auth',
  'api-key': 'API Key',
  oauth1: 'OAuth 1.0',
  oauth2: 'OAuth 2.0',
  hawk: 'Hawk Authentication',
  aws: 'AWS Signature',
  ntlm: 'NTLM Authentication [Beta]',
  akamai: 'Akamai EdgeGrid',
};

function buildAuthorizationDetails(auth: RequestAuth): DocAuthorization {
  const type = auth.type ?? 'none';
  const label = AUTH_LABELS[type] ?? type;

  if (type === 'bearer') {
    return {
      type,
      label,
      fields: [{ key: 'Token', value: auth.bearerToken || '' }],
      note: 'The Authorization header will be automatically generated when you send the request.',
    };
  }

  if (type === 'basic') {
    return {
      type,
      label,
      fields: [
        { key: 'Username', value: auth.basicUsername || '' },
        { key: 'Password', value: auth.basicPassword ? '••••••••' : '' },
      ],
      note: 'Credentials are sent as a Base64-encoded Authorization header.',
    };
  }

  if (type === 'api-key') {
    return {
      type,
      label,
      fields: [
        { key: 'Key', value: auth.apiKeyName || '' },
        { key: 'Value', value: auth.apiKeyValue || '' },
        { key: 'Add to', value: auth.apiKeyIn === 'query' ? 'Query params' : 'Header' },
      ],
    };
  }

  if (type === 'oauth2') {
    return {
      type,
      label,
      fields: [{ key: 'Access Token', value: auth.oauthToken || '' }],
      note: 'The Authorization header will be automatically generated when you send the request.',
    };
  }

  return { type: 'none', label: 'No Auth', fields: [] };
}

function buildAuthHeadersForCurl(auth: RequestAuth, variables: Record<string, string>): DocKeyValue[] {
  const resolved = (text: string) => resolveVars(text, variables);
  const headers: DocKeyValue[] = [];

  if (auth.type === 'bearer') {
    const token = resolved(auth.bearerToken).trim();
    if (token) headers.push({ key: 'Authorization', value: `Bearer ${token}` });
  } else if (auth.type === 'basic') {
    const user = resolved(auth.basicUsername);
    const pass = resolved(auth.basicPassword);
    if (user || pass) {
      headers.push({ key: 'Authorization', value: `Basic ${Buffer.from(`${user}:${pass}`).toString('base64')}` });
    }
  } else if (auth.type === 'oauth2') {
    const token = resolved(auth.oauthToken).trim();
    if (token) headers.push({ key: 'Authorization', value: `Bearer ${token}` });
  } else if (auth.type === 'api-key' && auth.apiKeyIn === 'header') {
    const name = auth.apiKeyName.trim();
    const value = resolved(auth.apiKeyValue).trim();
    if (name && value) headers.push({ key: name, value });
  }

  return headers;
}

function formatBody(body: string, bodyType: string): string {
  if (!body?.trim()) return '';
  if (bodyType === 'json') {
    try {
      return JSON.stringify(JSON.parse(body), null, 2);
    } catch {
      return body;
    }
  }
  return body;
}

function authSummary(authType: string, auth: ReturnType<typeof parseRequestConfig>['auth']): string {
  switch (authType) {
    case 'bearer':
      return `Bearer token${auth.bearerToken ? ` (${auth.bearerToken})` : ''}`;
    case 'basic':
      return `Basic auth — user: ${auth.basicUsername || '(not set)'}`;
    case 'api-key':
      return `API Key in ${auth.apiKeyIn}: ${auth.apiKeyName}`;
    case 'oauth2':
      return 'OAuth 2.0';
    default:
      return 'None';
  }
}

function buildCurlExample(
  method: string,
  url: string,
  headers: DocKeyValue[],
  queryParams: DocKeyValue[],
  authHeaders: DocKeyValue[],
  body: string,
  bodyType: string
): string {
  const fullUrl = appendQueryParams(url, queryParams);
  const lines = [`curl -X ${method.toUpperCase()} '${fullUrl}' \\`];

  const merged: DocKeyValue[] = [];
  const seen = new Set<string>();
  for (const h of [...authHeaders, ...headers]) {
    const lower = h.key.toLowerCase();
    if (!seen.has(lower)) {
      seen.add(lower);
      merged.push(h);
    }
  }
  if (merged.length === 0) {
    if (body && bodyType === 'json') merged.push({ key: 'Content-Type', value: 'application/json' });
    else merged.push({ key: 'Accept', value: 'application/json' });
  } else if (body && bodyType === 'json' && !seen.has('content-type')) {
    merged.push({ key: 'Content-Type', value: 'application/json' });
  }

  for (const h of merged) {
    lines.push(`  -H '${h.key}: ${h.value}' \\`);
  }

  if (body?.trim() && !['GET', 'HEAD'].includes(method.toUpperCase())) {
    const escaped = body.replace(/'/g, "'\\''");
    lines.push(`  -d '${escaped}'`);
  } else {
    lines[lines.length - 1] = lines[lines.length - 1].replace(/ \\$/, '');
  }

  return lines.join('\n');
}

function buildResponseSample(method: string, name: string, bodyType: string, requestBody: string): string {
  const upper = method.toUpperCase();

  if (upper === 'DELETE') {
    return JSON.stringify({ success: true, message: `${name} deleted` }, null, 2);
  }

  if (upper === 'POST' || upper === 'PUT' || upper === 'PATCH') {
    if (requestBody?.trim() && bodyType === 'json') {
      try {
        const parsed = JSON.parse(requestBody) as Record<string, unknown>;
        return JSON.stringify({ id: 1, ...parsed, createdAt: new Date().toISOString() }, null, 2);
      } catch {
        /* fall through */
      }
    }
    return JSON.stringify(
      { id: 1, name: 'Example resource', status: 'created', createdAt: new Date().toISOString() },
      null,
      2
    );
  }

  if (name.toLowerCase().includes('list') || name.toLowerCase().includes('all')) {
    return JSON.stringify(
      [
        { id: 1, name: 'Item one' },
        { id: 2, name: 'Item two' },
      ],
      null,
      2
    );
  }

  return JSON.stringify({ id: 1, name: 'Example resource', status: 'ok' }, null, 2);
}

export function buildApiDocumentation(
  project: Pick<ProjectFull, 'name' | 'description' | 'collections'>,
  environments: ExportEnvironment[] = []
): ApiDocumentation {
  const primaryEnv = environments[0];
  const variables: Record<string, string> = {};
  for (const v of primaryEnv?.variables ?? []) {
    if (v.key?.trim()) variables[v.key.trim()] = v.value ?? '';
  }

  const baseUrl = variables.BASE_URL ?? '{{BASE_URL}}';
  const endpoints: DetailedDocEndpoint[] = [];

  for (const col of project.collections) {
    for (const req of col.requests) {
      const config = parseRequestConfig(
        (() => {
          try {
            return req.requestConfig ? JSON.parse(req.requestConfig) : null;
          } catch {
            return null;
          }
        })()
      );

      const headers = enabledRows(config.headers);
      const queryParams = enabledRows(config.params);
      const bodyType = config.bodyType ?? 'none';
      const rawBody = formatBody(config.body, bodyType);
      const resolvedUrl = resolveVars(req.url, variables);
      const resolvedParams = queryParams.map((p) => ({
        ...p,
        key: p.key,
        value: resolveVars(p.value, variables),
      }));
      const authType = config.auth.type ?? 'none';
      const authorization = buildAuthorizationDetails(config.auth);
      const authHeaders = buildAuthHeadersForCurl(config.auth, variables);

      endpoints.push({
        id: req.id,
        tag: col.name,
        name: req.name,
        method: req.method.toUpperCase(),
        url: req.url,
        path: extractPath(req.url),
        headers,
        queryParams,
        authorization,
        bodyType,
        requestBody: rawBody,
        authType,
        authSummary: authSummary(authType, config.auth),
        requestExample: buildCurlExample(
          req.method,
          resolvedUrl,
          headers.map((h) => ({ ...h, value: resolveVars(h.value, variables) })),
          resolvedParams,
          authHeaders,
          rawBody,
          bodyType
        ),
        responseExample: buildResponseSample(req.method, req.name, bodyType, rawBody),
      });
    }
  }

  return {
    title: project.name,
    description: project.description ?? '',
    version: '1.0.0',
    environments,
    baseUrl,
    endpoints: endpoints.sort((a, b) => a.tag.localeCompare(b.tag) || a.path.localeCompare(b.path)),
  };
}
