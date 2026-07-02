import type { ProjectFull } from './db/project-repository';
import type { EnvironmentDto } from './db/environment-repository';
import type { EnvVariableDto } from './db/project-repository';
import type { AppState, ApiRequest, RequestFolder, AuthType, KeyValue, HttpMethod } from './types';
import {
  parseRequestConfig,
  DEFAULT_REQUEST_CONFIG,
  type RequestConfig,
  type AuthType as ConfigAuthType,
} from './domain/request-config';
import { DEFAULT_GRAPHQL_QUERY, normalizeProtocol } from './lib/protocol-utils';
import { computeAvgResponse, computeSuccessRate, computeRequestsPerSec } from './lib/request-utils';

const uid = () => Math.random().toString(36).slice(2, 10);

function authTypeToLegacy(type: ConfigAuthType): AuthType {
  switch (type) {
    case 'bearer':
      return 'bearer';
    case 'basic':
      return 'basic';
    case 'api-key':
      return 'apikey';
    case 'oauth2':
      return 'oauth2';
    case 'jwt-bearer':
      return 'jwt-bearer';
    case 'digest':
      return 'digest';
    case 'oauth1':
      return 'oauth1';
    case 'hawk':
      return 'hawk';
    case 'aws':
      return 'aws';
    case 'ntlm':
      return 'ntlm';
    case 'akamai':
      return 'akamai';
    default:
      return 'none';
  }
}

function legacyAuthToConfig(authType: AuthType, authToken: string): RequestConfig['auth'] {
  const auth = { ...DEFAULT_REQUEST_CONFIG.auth };
  auth.type = authType === 'apikey' ? 'api-key' : authType;
  if (authType === 'bearer' || authType === 'jwt-bearer') {
    auth.bearerToken = authToken;
  } else if (authType === 'basic' || authType === 'digest' || authType === 'ntlm') {
    auth.basicPassword = authToken;
  } else if (authType === 'apikey') {
    auth.apiKeyValue = authToken;
  } else if (authType === 'oauth2') {
    auth.oauthToken = authToken;
  }
  return auth;
}

function configToLegacyRequest(
  req: { id: string; name: string; method: string; url: string; protocol?: string },
  config: RequestConfig,
  collectionId: string,
  collectionProtocol?: string
): ApiRequest {
  const authType = authTypeToLegacy(config.auth.type);
  let authToken = '';
  if (config.auth.type === 'bearer' || config.auth.type === 'jwt-bearer') authToken = config.auth.bearerToken;
  else if (config.auth.type === 'basic' || config.auth.type === 'digest' || config.auth.type === 'ntlm') {
    authToken = config.auth.basicPassword;
  }
  else if (config.auth.type === 'api-key') authToken = config.auth.apiKeyValue;
  else if (config.auth.type === 'oauth2') authToken = config.auth.oauthToken;

  const protocol = req.protocol ?? collectionProtocol ?? 'http';
  let graphqlQuery = '';
  let graphqlVariables = '{}';

  if (protocol === 'graphql' && config.body) {
    try {
      const parsed = JSON.parse(config.body) as { query?: string; variables?: unknown };
      graphqlQuery = parsed.query ?? config.body;
      graphqlVariables =
        parsed.variables !== undefined ? JSON.stringify(parsed.variables, null, 2) : '{}';
    } catch {
      graphqlQuery = config.body;
    }
  }

  return {
    id: req.id,
    name: req.name,
    method: req.method as HttpMethod,
    url: req.url,
    protocol,
    params: config.params.map((p) => ({
      id: p.id,
      key: p.key,
      value: p.value,
      enabled: p.enabled,
      description: p.description,
    })),
    headers: config.headers.map((h) => ({
      id: h.id,
      key: h.key,
      value: h.value,
      enabled: h.enabled,
      description: h.description,
    })),
    authType,
    authToken,
    body: config.body,
    bodyType: config.bodyType,
    folderId: collectionId,
    requestConfig: config,
    graphqlQuery: protocol === 'graphql' ? graphqlQuery : undefined,
    graphqlVariables: protocol === 'graphql' ? graphqlVariables : undefined,
  };
}

export function projectToAppState(
  project: ProjectFull,
  environments: EnvironmentDto[],
  envVarsByEnv: Record<string, EnvVariableDto[]>,
  activeEnvironmentId: string,
  ui: Partial<AppState> & { darkMode?: boolean } = {},
  history: AppState['history'] = []
): AppState {
  const folders: RequestFolder[] = project.collections.map((col) => ({
    id: col.id,
    name: col.name,
    expanded: ui.expandedFolders?.includes(col.id) ?? true,
    protocol: col.protocol,
    requests: col.requests.map((req) => {
      const config = parseRequestConfig(JSON.parse(req.requestConfig ?? '{}'));
      return configToLegacyRequest(req, config, col.id, col.protocol);
    }),
  }));

  const activeProtocol = normalizeProtocol(ui.activeProtocol ?? 'http');
  const protocolRequestIds = new Set(
    folders
      .filter((f) => normalizeProtocol(f.protocol ?? 'http') === activeProtocol)
      .flatMap((f) => f.requests.map((r) => r.id))
  );
  const openTabs = (ui.openTabs ?? []).filter((id) => protocolRequestIds.has(id));
  const activeTabId =
    ui.activeTabId && protocolRequestIds.has(ui.activeTabId)
      ? ui.activeTabId
      : openTabs[0] ?? '';
  const recent = history;
  const chartFromHistory = recent
    .slice(0, 12)
    .reverse()
    .map((h) => Math.min(100, Math.max(10, (h.durationMs / 500) * 100)));

  const performance = {
    avgResponseMs: computeAvgResponse(recent.map((h) => h.durationMs)),
    requestsPerSec: parseFloat(computeRequestsPerSec(recent)),
    successRate: computeSuccessRate(recent.map((h) => h.status)),
    chart: chartFromHistory,
  };

  return {
    projectId: project.id,
    projectName: project.name,
    projectDescription: project.description,
    activeEnvironmentId,
    environments: environments.map((env) => ({
      id: env.id,
      name: env.name,
      color: env.color.startsWith('#') ? env.color : envColorToTailwind(env.color),
      variables: Object.fromEntries(
        (envVarsByEnv[env.id] ?? []).map((v) => [v.key, v.value])
      ),
    })),
    folders,
    openTabs: openTabs.length > 0 ? openTabs : activeTabId ? [activeTabId] : [],
    activeTabId,
    history,
    themeMode: ui.themeMode ?? (ui.darkMode ? 'dark' : 'system'),
    language: ui.language ?? 'en',
    activeProtocol: ui.activeProtocol ?? 'http',
    activeGraphqlTab: ui.activeGraphqlTab ?? 'query',
    activeRequestTab: ui.activeRequestTab ?? 'params',
    activeResponseTab: ui.activeResponseTab ?? 'json',
    sidebarNav: ui.sidebarNav ?? 'workspace',
    expandedFolders: ui.expandedFolders ?? folders.filter((f) => f.expanded).map((f) => f.id),
    searchQuery: ui.searchQuery ?? '',
    performance,
    projects: [],
    planLimits: {
      tierName: 'Free',
      maxProjects: Number.MAX_SAFE_INTEGER,
      projectCount: 0,
      canCreateProject: true,
    },
  };
}

function envColorToTailwind(hex: string): string {
  const map: Record<string, string> = {
    '#10B981': 'green',
    '#F59E0B': 'orange',
    '#2563EB': 'blue',
    '#EF4444': 'red',
    '#7C3AED': 'purple',
    '#06B6D4': 'cyan',
  };
  return map[hex] ?? 'blue';
}

export function requestToConfig(request: ApiRequest): RequestConfig {
  const mapParams = () =>
    request.params.map((p) => ({
      id: p.id,
      key: p.key,
      value: p.value,
      description: p.description ?? '',
      enabled: p.enabled,
    }));
  const mapHeaders = () =>
    request.headers.map((h) => ({
      id: h.id,
      key: h.key,
      value: h.value,
      description: h.description ?? '',
      enabled: h.enabled,
    }));

  if (request.requestConfig && request.protocol !== 'graphql') {
    const config = parseRequestConfig(request.requestConfig);
    config.params = mapParams();
    config.headers = mapHeaders();
    config.auth = legacyAuthToConfig(request.authType, request.authToken);
    config.body = request.body;
    if (request.bodyType) config.bodyType = request.bodyType;
    return config;
  }

  const config = request.requestConfig
    ? parseRequestConfig(request.requestConfig)
    : parseRequestConfig(null);
  config.params = mapParams();
  config.headers = mapHeaders();
  config.auth = legacyAuthToConfig(request.authType, request.authToken);

  if (request.protocol === 'graphql') {
    config.bodyType = 'json';
    let variables: unknown = undefined;
    if (request.graphqlVariables?.trim() && request.graphqlVariables.trim() !== '{}') {
      try {
        variables = JSON.parse(request.graphqlVariables);
      } catch {
        variables = undefined;
      }
    }
    config.body = JSON.stringify(
      { query: request.graphqlQuery ?? '', variables },
      null,
      2
    );
    return config;
  }

  if (request.protocol === 'soap') {
    config.bodyType = 'xml';
    config.body = request.body?.trim() ? request.body : config.body;
    if (!config.soapAction) config.soapAction = '';
    if (!config.soapContentType) config.soapContentType = 'text/xml';
    return config;
  }

  config.body = request.body;
  if (request.bodyType) config.bodyType = request.bodyType;
  return config;
}

export function envVarsFromState(state: AppState): { key: string; value: string; secret?: boolean }[] {
  const env = state.environments.find((e) => e.id === state.activeEnvironmentId);
  if (!env) return [];
  return Object.entries(env.variables).map(([key, value]) => ({
    key,
    value,
    secret: key.includes('TOKEN') || key.includes('KEY') || key.includes('SECRET'),
  }));
}

export function findRequestInState(state: AppState, id: string): ApiRequest | undefined {
  for (const folder of state.folders) {
    const req = folder.requests.find((r) => r.id === id);
    if (req) return req;
  }
  return undefined;
}

export function keyValueRows(items: KeyValue[]): KeyValue[] {
  return items.length > 0 ? items : [{ id: uid(), key: '', value: '', enabled: true }];
}
