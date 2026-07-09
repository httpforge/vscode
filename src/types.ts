import type { RequestConfig, BodyType } from './domain/request-config';
import type { AppInfo } from './branding';

export type { AppInfo };

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | 'OPTIONS';

export type AuthType = 'none' | 'bearer' | 'basic' | 'apikey' | 'jwt-bearer' | 'digest' | 'oauth1' | 'oauth2' | 'hawk' | 'aws' | 'ntlm' | 'akamai';

export interface KeyValue {
  id: string;
  key: string;
  value: string;
  enabled: boolean;
  description?: string;
}

export interface ApiRequest {
  id: string;
  name: string;
  method: HttpMethod;
  url: string;
  protocol?: string;
  params: KeyValue[];
  headers: KeyValue[];
  authType: AuthType;
  authToken: string;
  body: string;
  bodyType?: BodyType;
  folderId?: string;
  requestConfig?: RequestConfig;
  graphqlQuery?: string;
  graphqlVariables?: string;
}

export interface RequestFolder {
  id: string;
  name: string;
  expanded: boolean;
  protocol?: string;
  requests: ApiRequest[];
}

export interface ProjectSummary {
  id: string;
  name: string;
  description: string;
  collectionCount: number;
  requestCount: number;
}

export interface PlanLimitsInfo {
  tierName: string;
  maxProjects: number;
  projectCount: number;
  canCreateProject: boolean;
}

export interface Environment {
  id: string;
  name: string;
  color: string;
  variables: Record<string, string>;
  /** When true, environment is included in export, Git sync, and API docs publish */
  includeInExport?: boolean;
}

export interface HistoryEntry {
  id: string;
  method: HttpMethod;
  url: string;
  status: number;
  durationMs: number;
  sizeBytes: number;
  timestamp: number;
  requestId?: string;
}

export interface TimelinePhase {
  name: string;
  ms: number;
  color: string;
}

export interface HttpRequestSnapshot {
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: string;
}

export interface HttpResponseResult {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: string;
  durationMs: number;
  sizeBytes: number;
  timeline: TimelinePhase[];
  request?: HttpRequestSnapshot;
}

export type ThemeMode = 'system' | 'light' | 'dark';

export type AppLanguage =
  | 'en'
  | 'uk'
  | 'ru'
  | 'tr'
  | 'de'
  | 'fr'
  | 'pt-BR'
  | 'ko'
  | 'bn'
  | 'es'
  | 'it'
  | 'ro'
  | 'pl'
  | 'zh-CN'
  | 'zh-TW'
  | 'ar'
  | 'ja'
  | 'ka'
  | 'nl'
  | 'fa';

export interface AppState {
  projectId: string;
  projectName: string;
  projectDescription?: string;
  projects: ProjectSummary[];
  planLimits: PlanLimitsInfo;
  activeEnvironmentId: string;
  environments: Environment[];
  folders: RequestFolder[];
  openTabs: string[];
  activeTabId: string;
  history: HistoryEntry[];
  themeMode: ThemeMode;
  language: AppLanguage;
  activeProtocol: string;
  activeGraphqlTab: 'query' | 'variables' | 'headers';
  activeRequestTab: 'params' | 'headers' | 'auth' | 'body' | 'scripts' | 'tests' | 'settings' | 'cookies';
  activeResponseTab: 'json' | 'raw' | 'headers' | 'timeline';
  sidebarNav: string;
  expandedFolders: string[];
  searchQuery: string;
  lastResponse?: HttpResponseResult;
  performance: {
    avgResponseMs: number;
    requestsPerSec: number;
    successRate: number;
    chart: number[];
  };
}

export type WebviewToExtensionMessage =
  | { type: 'ready' }
  | { type: 'sendRequest'; requestId: string; state?: AppState }
  | { type: 'sendGraphQL'; requestId: string; query: string; variables: string; state?: AppState }
  | { type: 'saveState'; state: AppState }
  | { type: 'notify'; message: string; level?: 'info' | 'error' | 'success' }
  | { type: 'importCollection'; format: string }
  | { type: 'exportCollection'; format: string; collectionId?: string; includeEnvironments?: boolean; environmentIds?: string[] }
  | { type: 'exportProject'; format: string; includeEnvironments?: boolean; environmentIds?: string[] }
  | { type: 'loadGitStatus' }
  | { type: 'loadGitDiff'; filePath: string; staged?: boolean }
  | { type: 'createProject'; name: string; description?: string }
  | { type: 'updateProject'; projectId: string; name: string; description?: string }
  | { type: 'deleteProject'; projectId: string }
  | { type: 'switchProject'; projectId: string }
  | { type: 'switchProtocol'; protocol: string }
  | { type: 'createRequest'; collectionId?: string; protocol?: string }
  | { type: 'createCollection'; name: string; protocol?: string }
  | { type: 'updateCollection'; collectionId: string; name: string }
  | { type: 'deleteCollection'; collectionId: string }
  | { type: 'deleteRequest'; requestId: string }
  | { type: 'createEnvironment'; name: string; color: string }
  | { type: 'updateEnvironment'; environmentId: string; name: string; color: string }
  | { type: 'duplicateEnvironment'; sourceId: string; name: string; color?: string }
  | { type: 'deleteEnvironment'; environmentId: string }
  | { type: 'exportEnvironments'; environmentIds?: string[] }
  | { type: 'importEnvironments' }
  | { type: 'gitAction'; action: string; payload?: Record<string, string>; environmentIds?: string[] }
  | { type: 'fetchWsdl'; url: string; requestId: string }
  | { type: 'openExternal'; url: string };

export type ExtensionToWebviewMessage =
  | { type: 'init'; state: AppState; systemIsDark: boolean; appInfo: AppInfo }
  | { type: 'theme'; systemIsDark: boolean }
  | { type: 'response'; result: HttpResponseResult; historyEntry: HistoryEntry }
  | { type: 'error'; message: string }
  | { type: 'sending' }
  | { type: 'success'; message: string; state?: AppState }
  | { type: 'gitStatus'; status: GitStatusPayload }
  | { type: 'gitDiff'; filePath: string; staged: boolean; diff: string }
  | { type: 'wsdlParsed'; requestId: string; targetNamespace: string; serviceUrl?: string; operations: { name: string; soapAction: string }[] }
  | { type: 'wsdlError'; message: string; requestId?: string };

export interface GitFileChangePayload {
  path: string;
  status: 'modified' | 'added' | 'deleted' | 'renamed' | 'copied' | 'untracked';
  staged: boolean;
}

export interface GitCommitEntryPayload {
  hash: string;
  shortHash: string;
  message: string;
  author: string;
  date: string;
}

export interface GitStatusPayload {
  repoPath: string | null;
  isRepo: boolean;
  branch: string | null;
  remoteUrl: string | null;
  hasChanges: boolean;
  changedFiles: string[];
  stagedFiles: GitFileChangePayload[];
  unstagedFiles: GitFileChangePayload[];
  commits: GitCommitEntryPayload[];
  ahead: number;
  behind: number;
}

// Re-export domain types from HttpForge model
export type { Protocol, Project, Collection, EnvVariable, ProjectEnvironment } from './domain';
