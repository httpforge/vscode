import * as vscode from 'vscode';
import { APP_NAME } from './branding';
import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from 'fs';
import { join } from 'path';
import { initDatabase, closeDatabase, isDatabaseReady } from './db/database';
import {
  listProjects,
  getProjectById,
  createProject,
  updateProject,
  deleteProject,
  getEnvVariables,
  getAllEnvVariablesForProject,
  upsertEnvVariable,
  deleteEnvVariable,
  getSetting,
  setSetting,
  deleteSetting,
  getDbInfo,
} from './db/project-repository';
import {
  createCollection,
  updateCollection,
  deleteCollection,
  listCollectionsForProject,
} from './db/collection-repository';
import { createRequest, updateRequest, deleteRequest } from './db/request-repository';
import {
  listEnvironments,
  createEnvironment,
  updateEnvironment,
  duplicateEnvironment,
  deleteEnvironment,
} from './db/environment-repository';
import { getPlanLimits, UNLIMITED_PROJECTS } from './plan-limits';
import { executeHttpRequest } from './http/request-executor';
import { validateEnvVarName } from './lib/env-var-utils';
import { buildExecutionPayload, hasUnresolvedVars, listUnresolvedVars } from './lib/request-config';
import { tryFormatJson } from './lib/request-utils';
import {
  parseImportContent,
  importCollectionsIntoProject,
  importFileFilters,
  extractEnvironmentsFromExport,
  type ImportCollection,
  type ImportEnvironment,
  type ImportResult,
} from './import/import-service';
import { configureGitSettings } from './git/git-service';
import { defaultFilename, serializeExport, type ExportEnvironment } from './export/export-service';
import {
  getGitStatus,
  initGitRepo,
  setGitRemote,
  gitCommit,
  gitPush,
  gitPull,
  gitClone,
  gitStage,
  gitUnstage,
  gitStageAll,
  gitUnstageAll,
  getGitDiff,
  readRepoCollectionsFile,
  setGitRepoPath,
  getGitRepoPath,
  defaultGitRepoPath,
  setGitStorageRoot,
} from './git/git-service';
import { syncCollectionsToRepo, syncProjectDataToRepo } from './git/collections-sync';
import { getPublishedDocsPath } from './docs/docs-publisher';
import { generateApiDocsHtml, generateRichApiDocsHtml, type OpenApiSpec } from './docs/api-docs-generator';
import { buildApiDocumentation } from './docs/doc-spec-builder';
import { buildOpenApi } from './export/export-service';
import { projectToAppState, requestToConfig, findRequestInState } from './stateAdapter';
import { UiStore } from './ui-store';
import type { AppState, HistoryEntry, HttpResponseResult, ApiRequest } from './types';
import {
  defaultUrlForProtocol,
  defaultMethodForProtocol,
  defaultNameForProtocol,
  defaultCollectionNameForProtocol,
  normalizeProtocol,
  DEFAULT_GRAPHQL_QUERY,
  DEFAULT_SOAP_ENVELOPE,
  DEFAULT_SOAP_ACTION,
} from './lib/protocol-utils';
import { parseRequestConfig } from './domain/request-config';
import { parseWsdl, type WsdlParseResult } from './soap/wsdl-parser';
import type { Protocol } from './domain';
import { createDefaultState } from './defaults';
import { isLegacyMockEnvironment, isLegacyMockProject, variablesForNewEnvironment } from './db/seed-data';
import { JsonStore, type FallbackProjectData, type FallbackProjectsStore } from './json-store';
import type { CollectionDto } from './db/project-repository';
import type { RequestDto } from './db/request-repository';

const FALLBACK_STATE_KEY = 'httpforge.fallbackState';
const FALLBACK_PROJECTS_KEY = 'httpforge.fallbackProjects';
const LEGACY_FALLBACK_STATE_KEYS = ['apiwatch.fallbackState', 'apiforge.fallbackState'];
const LEGACY_FALLBACK_PROJECTS_KEYS = ['apiwatch.fallbackProjects', 'apiforge.fallbackProjects'];

const uid = () => Math.random().toString(36).slice(2, 10);

function normalizeSidebarNav(nav?: string): string {
  if (!nav || nav === 'projects' || nav === 'history' || nav === 'dashboard' || nav === 'import-export') {
    return 'workspace';
  }
  return nav;
}

function applySoapDefaults(req: ApiRequest): void {
  req.body = DEFAULT_SOAP_ENVELOPE;
  req.bodyType = 'xml';
  req.method = 'POST';
  const config = parseRequestConfig(null);
  config.bodyType = 'xml';
  config.body = DEFAULT_SOAP_ENVELOPE;
  config.soapAction = DEFAULT_SOAP_ACTION;
  config.soapContentType = 'text/xml';
  req.requestConfig = config;
}

export class ApiService {
  private projectId = '';
  private dbAvailable = false;
  private readonly jsonStore: JsonStore;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly uiStore: UiStore
  ) {
    this.jsonStore = new JsonStore(context.globalStorageUri.fsPath);
  }

  private getLegacyGlobalState<T>(legacyKeys: string[]): T | undefined {
    for (const key of legacyKeys) {
      const value = this.context.globalState.get<T>(key);
      if (value !== undefined) return value;
    }
    return undefined;
  }

  initialize(): void {
    const storagePath = this.context.globalStorageUri.fsPath;
    setGitStorageRoot(storagePath);
    if (!this.tryInitDatabase(storagePath)) {
      const store = this.loadFallbackProjectsStore();
      this.projectId = store.activeProjectId || store.projects[0]?.id || '';
    }
    configureGitSettings({
      get: (key) => this.getAppSetting(key),
      set: (key, value) => this.setAppSetting(key, value),
    });
  }

  private getAppSetting(key: string): string | null {
    if (this.canUseDatabase()) {
      try {
        return getSetting(key);
      } catch (err) {
        this.markDbUnavailable(err);
      }
    }
    const store = this.loadFallbackProjectsStore();
    return store.settings?.[key] ?? null;
  }

  private setAppSetting(key: string, value: string): void {
    if (this.canUseDatabase()) {
      try {
        setSetting(key, value);
        return;
      } catch (err) {
        this.markDbUnavailable(err);
      }
    }
    const store = this.loadFallbackProjectsStore();
    store.settings = store.settings ?? {};
    store.settings[key] = value;
    this.saveFallbackProjectsStore(store);
  }

  private tryInitDatabase(storagePath: string): boolean {
    // Skip SQLite in VS Code — native module ABI often mismatches Electron; JSON storage is reliable.
    if (process.env.HTTPFORGE_USE_SQLITE !== '1' && process.env.APIFORGE_USE_SQLITE !== '1') {
      this.dbAvailable = false;
      return false;
    }
    try {
      initDatabase(storagePath);
      this.dbAvailable = isDatabaseReady();
      if (this.canUseDatabase()) {
        this.ensureDefaultProject();
      }
      return this.dbAvailable;
    } catch (err) {
      this.dbAvailable = false;
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[${APP_NAME}] Database init failed, using fallback storage:`, message);
      void vscode.window.showWarningMessage(
        `${APP_NAME}: SQLite unavailable — using built-in storage. Reinstall the extension if persistence issues persist.`
      );
      return false;
    }
  }

  private canUseDatabase(): boolean {
    return this.dbAvailable && isDatabaseReady();
  }

  private markDbUnavailable(err: unknown): void {
    if (!this.dbAvailable) return;
    this.dbAvailable = false;
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[${APP_NAME}] Database unavailable, using JSON storage:`, message);
  }

  private ensureDb(): boolean {
    if (this.canUseDatabase()) return true;
    return this.tryInitDatabase(this.context.globalStorageUri.fsPath);
  }

  isDbAvailable(): boolean {
    return this.dbAvailable;
  }

  dispose(): void {
    closeDatabase();
  }

  private ensureDefaultProject(): void {
    const projects = listProjects();
    if (projects.length === 0) return;

    const activeId = getSetting('activeProjectId');
    const activeExists = activeId != null && projects.some((p) => p.id === activeId);
    this.projectId = activeExists ? activeId! : projects[0].id;
    if (!activeExists) {
      setSetting('activeProjectId', this.projectId);
    }
  }

  getActiveProjectId(): string {
    if (this.projectId) return this.projectId;
    if (!this.canUseDatabase()) {
      const store = this.loadFallbackProjectsStore();
      return store.activeProjectId || store.projects[0]?.id || '';
    }
    try {
      return getSetting('activeProjectId') ?? '';
    } catch {
      return this.loadFallbackProjectsStore().activeProjectId;
    }
  }

  setActiveProjectId(id: string): void {
    this.projectId = id;
    if (this.canUseDatabase()) {
      try {
        setSetting('activeProjectId', id);
      } catch (err) {
        this.markDbUnavailable(err);
      }
      return;
    }
    const store = this.loadFallbackProjectsStore();
    store.activeProjectId = id;
    this.saveFallbackProjectsStore(store);
  }

  async buildAppState(): Promise<AppState> {
    if (!this.canUseDatabase()) {
      return this.buildFallbackState();
    }

    try {
      const projectId = this.getActiveProjectId();
      let project = getProjectById(projectId);

      if (!project) {
        const history = await this.uiStore.loadHistory();
        const ui = await this.uiStore.loadUi();
        const empty = createDefaultState();
        return this.enrichAppState({
          ...empty,
          history,
          openTabs: ui.openTabs,
          activeTabId: ui.activeTabId,
          themeMode: ui.themeMode ?? empty.themeMode,
          language: ui.language ?? empty.language,
          activeProtocol: ui.activeProtocol ?? empty.activeProtocol,
          activeGraphqlTab: ui.activeGraphqlTab ?? empty.activeGraphqlTab,
          activeRequestTab: ui.activeRequestTab ?? empty.activeRequestTab,
          activeResponseTab: ui.activeResponseTab ?? empty.activeResponseTab,
          sidebarNav: normalizeSidebarNav(ui.sidebarNav ?? 'workspace'),
          expandedFolders: ui.expandedFolders ?? empty.expandedFolders,
          searchQuery: ui.searchQuery ?? empty.searchQuery,
        });
      }
      if (!project) throw new Error('No project available');

      const environments = listEnvironments(project.id);
      const activeEnvId = getSetting('activeEnvironment') ?? environments[0]?.id ?? '';
      const envVars = getAllEnvVariablesForProject(project.id);
      const ui = await this.uiStore.loadUi();
      const history = await this.uiStore.loadHistory();

      const appState = projectToAppState(project, environments, envVars, activeEnvId, ui, history);
      return this.enrichAppState(appState);
    } catch (err) {
      this.markDbUnavailable(err);
      return this.buildFallbackState();
    }
  }

  private enrichAppState(state: AppState): AppState {
    if (this.canUseDatabase()) {
      try {
        const projects = listProjects();
        const limits = getPlanLimits();
        return {
          ...state,
          projects: projects.map((p) => ({
            id: p.id,
            name: p.name,
            description: p.description,
            collectionCount: p.collectionCount,
            requestCount: p.requestCount,
          })),
          planLimits: {
            tierName: limits.tierName,
            maxProjects: limits.maxProjects,
            projectCount: limits.projectCount,
            canCreateProject: limits.canCreateProject,
          },
        };
      } catch (err) {
        this.markDbUnavailable(err);
      }
    }

    const projects = this.loadFallbackProjectsStore().projects.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      collectionCount: p.folders.length,
      requestCount: p.folders.reduce((n, f) => n + f.requests.length, 0),
    }));

    const limits = this.getPlanLimitsInfo();

    return {
      ...state,
      projects,
      planLimits: {
        tierName: limits.tierName,
        maxProjects: limits.maxProjects,
        projectCount: limits.projectCount,
        canCreateProject: limits.canCreateProject,
      },
    };
  }

  getPlanLimitsInfo() {
    if (!this.canUseDatabase()) {
      const count = this.loadFallbackProjectsStore().projects.length;
      return {
        tier: 'free',
        tierName: 'Free',
        maxProjects: UNLIMITED_PROJECTS,
        projectCount: count,
        canCreateProject: true,
      };
    }
    return getPlanLimits();
  }

  getPlanLimits() {
    return this.getPlanLimitsInfo();
  }

  async saveUiFromState(state: AppState): Promise<void> {
    await this.uiStore.saveUi(this.uiStore.extractUiFromState(state));
    await this.uiStore.saveHistory(state.history);

    if (!this.canUseDatabase()) {
      this.syncFallbackProjectFromState(state);
      await this.context.globalState.update(FALLBACK_STATE_KEY, state);
      return;
    }

    try {
      const projectId = state.projectId || this.getActiveProjectId();
      if (state.activeEnvironmentId) {
        setSetting('activeEnvironment', state.activeEnvironmentId);
      }

      for (const env of state.environments) {
        for (const [key, value] of Object.entries(env.variables)) {
          const check = validateEnvVarName(key);
          if (!check.valid) continue;
          upsertEnvVariable(projectId, env.id, check.normalized, value, /token|key|secret|password/i.test(check.normalized));
        }
      }

      for (const req of state.folders.flatMap((f) => f.requests)) {
        const config = requestToConfig(req);
        updateRequest(projectId, req.id, {
          name: req.name,
          method: req.method,
          url: req.url,
          protocol: req.protocol ?? 'http',
          requestConfig: JSON.stringify(config),
        });
      }
    } catch (err) {
      this.markDbUnavailable(err);
      this.syncFallbackProjectFromState(state);
      await this.context.globalState.update(FALLBACK_STATE_KEY, state);
    }
  }

  async executeRequest(state: AppState, requestId: string): Promise<{
    result: HttpResponseResult;
    historyEntry: HistoryEntry;
    state: AppState;
  }> {
    const request = findRequestInState(state, requestId);
    if (!request) throw new Error('Request not found');

    const projectId = state.projectId || this.getActiveProjectId();
    const envId = state.activeEnvironmentId || state.environments[0]?.id || '';
    const activeEnv = state.environments.find((e) => e.id === envId);
    const envVars = this.canUseDatabase()
      ? getEnvVariables(projectId, envId).map((v) => ({
          key: v.key,
          value: v.value,
          secret: v.secret,
        }))
      : Object.entries(activeEnv?.variables ?? {}).map(([key, value]) => ({
          key,
          value,
          secret: false,
        }));

    const config = requestToConfig(request);
    const payload = buildExecutionPayload(config, request.method, request.url, envVars);

    if (hasUnresolvedVars(payload.url)) {
      const unresolved = listUnresolvedVars(payload.url);
      const envLabel = activeEnv?.name ?? 'your environment';
      throw new Error(
        `Unresolved URL variable(s): ${unresolved.join(', ')}. Open Environments, select "${envLabel}", and set their values (e.g. BASE_URL = https://api.example.com).`
      );
    }

    await this.saveUiFromState(state);

    if (this.canUseDatabase()) {
      updateRequest(projectId, request.id, {
        name: request.name,
        method: request.method,
        url: request.url,
        requestConfig: JSON.stringify(config),
      });
    }

    const raw = await executeHttpRequest({
      method: request.method,
      url: payload.url,
      headers: payload.headers,
      body: payload.body,
    });

    const result: HttpResponseResult = {
      status: raw.status,
      statusText: raw.statusText,
      headers: raw.headers,
      body: tryFormatJson(raw.body),
      durationMs: raw.durationMs,
      sizeBytes: raw.sizeBytes,
      timeline: raw.timeline.map((t) => ({ name: t.name, ms: t.value, color: t.color })),
    };

    const historyEntry: HistoryEntry = {
      id: Date.now().toString(36),
      method: request.method,
      url: payload.url,
      status: result.status,
      durationMs: result.durationMs,
      sizeBytes: result.sizeBytes,
      timestamp: Date.now(),
      requestId: request.id,
    };

    const history = await this.uiStore.loadHistory();
    history.unshift(historyEntry);
    await this.uiStore.saveHistory(history);

    const newState = await this.buildAppState();
    newState.lastResponse = result;
    await this.uiStore.saveUi({
      ...(await this.uiStore.loadUi()),
      ...this.uiStore.extractUiFromState(newState),
    });
    return { result, historyEntry, state: newState };
  }

  async executeGraphQL(
    state: AppState,
    requestId: string,
    query: string,
    variables: string
  ): Promise<{
    result: HttpResponseResult;
    historyEntry: HistoryEntry;
    state: AppState;
  }> {
    const request = findRequestInState(state, requestId);
    if (!request) throw new Error('Request not found');

    request.protocol = 'graphql';
    request.method = 'POST';
    request.graphqlQuery = query;
    request.graphqlVariables = variables || '{}';

    for (const folder of state.folders) {
      const idx = folder.requests.findIndex((r) => r.id === requestId);
      if (idx >= 0) {
        folder.requests[idx] = { ...request };
        break;
      }
    }

    return this.executeRequest(state, requestId);
  }

  // --- Projects ---
  listProjects() {
    if (!this.canUseDatabase()) {
      return this.loadFallbackProjectsStore().projects.map((p) => ({
        id: p.id,
        name: p.name,
        description: p.description,
        collectionCount: p.folders.length,
        requestCount: p.folders.reduce((n, f) => n + f.requests.length, 0),
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }));
    }
    return listProjects();
  }

  getProject(id: string) {
    if (!this.canUseDatabase()) {
      const project = this.loadFallbackProjectsStore().projects.find((p) => p.id === id);
      if (!project) return null;
      return {
        id: project.id,
        name: project.name,
        description: project.description,
        collections: project.folders.map((f) => ({
          id: f.id,
          name: f.name,
          protocol: f.protocol ?? 'http',
          requests: f.requests.map((r) => ({
            id: r.id,
            name: r.name,
            method: r.method,
            url: r.url,
            protocol: r.protocol ?? 'http',
            requestConfig: JSON.stringify(requestToConfig(r)),
          })),
        })),
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
    }
    return getProjectById(id);
  }

  createProject(name: string, description?: string) {
    if (this.canUseDatabase()) {
      try {
        const project = createProject(name, description);
        this.setActiveProjectId(project.id);
        return project;
      } catch (err) {
        this.markDbUnavailable(err);
      }
    }
    return this.createFallbackProject(name, description);
  }

  updateProject(id: string, data: { name?: string; description?: string }) {
    if (!this.canUseDatabase()) {
      const store = this.loadFallbackProjectsStore();
      const project = store.projects.find((p) => p.id === id);
      if (!project) throw new Error('Project not found');
      if (data.name?.trim()) project.name = data.name.trim();
      if (data.description !== undefined) project.description = data.description.trim();
      this.saveFallbackProjectsStore(store);
      return { id, name: project.name, description: project.description, collections: [], createdAt: Date.now(), updatedAt: Date.now() };
    }
    return updateProject(id, data);
  }

  deleteProject(id: string) {
    const wasActive = this.getActiveProjectId() === id;

    if (!this.canUseDatabase()) {
      const store = this.loadFallbackProjectsStore();
      const idx = store.projects.findIndex((p) => p.id === id);
      if (idx < 0) throw new Error('Project not found');
      store.projects.splice(idx, 1);
      if (store.activeProjectId === id) {
        store.activeProjectId = store.projects[0]?.id ?? '';
        this.projectId = store.activeProjectId;
      }
      this.saveFallbackProjectsStore(store);
      this.purgeProjectRelatedData(id, wasActive);
      return { success: true, activeProjectId: store.activeProjectId };
    }

    this.clearActiveEnvironmentForProject(id);
    const deleted = deleteProject(id);
    if (!deleted) throw new Error('Project not found');
    if (wasActive) {
      const remaining = listProjects();
      this.setActiveProjectId(remaining[0]?.id ?? '');
    }
    this.purgeProjectRelatedData(id, wasActive);
    return { success: true, activeProjectId: this.getActiveProjectId() };
  }

  switchProject(projectId: string): void {
    if (!this.canUseDatabase()) {
      const store = this.loadFallbackProjectsStore();
      if (!store.projects.some((p) => p.id === projectId)) {
        throw new Error('Project not found');
      }
      store.activeProjectId = projectId;
      this.projectId = projectId;
      this.saveFallbackProjectsStore(store);
      return;
    }
    this.setActiveProjectId(projectId);
  }

  getDbInfo() {
    if (!this.canUseDatabase()) {
      return { path: 'built-in storage', projectCount: this.loadFallbackProjectsStore().projects.length };
    }
    try {
      return getDbInfo();
    } catch (err) {
      this.markDbUnavailable(err);
      return { path: 'built-in storage', projectCount: this.loadFallbackProjectsStore().projects.length };
    }
  }

  // --- Environments ---
  listEnvironments(projectId: string) {
    return listEnvironments(projectId);
  }

  createEnvironment(projectId: string, name: string, color: string) {
    return createEnvironment(projectId, name, color);
  }

  updateEnvironment(projectId: string, environmentId: string, data: { name?: string; color?: string }) {
    return updateEnvironment(projectId, environmentId, data);
  }

  duplicateEnvironment(projectId: string, sourceId: string, name: string, color?: string) {
    return duplicateEnvironment(projectId, sourceId, name, color);
  }

  deleteEnvironment(projectId: string, environmentId: string) {
    const result = deleteEnvironment(projectId, environmentId);
    if (!this.dbAvailable) return result;
    try {
      const activeEnv = getSetting('activeEnvironment');
      if (activeEnv === environmentId && result.fallbackEnvironmentId) {
        setSetting('activeEnvironment', result.fallbackEnvironmentId);
      }
    } catch {
      /* settings unavailable */
    }
    return result;
  }

  getEnvVariables(projectId: string, environment: string) {
    return getEnvVariables(projectId, environment);
  }

  upsertEnvVariable(projectId: string, environment: string, key: string, value: string, secret?: boolean) {
    return upsertEnvVariable(projectId, environment, key, value, secret ?? false);
  }

  deleteEnvVariable(projectId: string, environment: string, key: string) {
    return deleteEnvVariable(projectId, environment, key);
  }

  async exportEnvironments(
    projectId: string,
    environmentIds?: string[]
  ): Promise<{ success: boolean; canceled?: boolean; filePath?: string }> {
    const project = this.getProject(projectId);
    const projectName = project?.name ?? 'project';

    let environments: { name: string; color: string; variables: { key: string; value: string; secret?: boolean }[] }[];
    const filterByIds = (id: string) => !environmentIds?.length || environmentIds.includes(id);

    if (this.canUseDatabase() && project) {
      environments = listEnvironments(projectId)
        .filter((env) => filterByIds(env.id))
        .map((env) => ({
          name: env.name,
          color: env.color,
          variables: getEnvVariables(projectId, env.id).map((v) => ({
            key: v.key,
            value: v.value,
            secret: v.secret,
          })),
        }));
    } else {
      const state = await this.buildFallbackState();
      environments = state.environments
        .filter((env) => filterByIds(env.id))
        .map((env) => ({
          name: env.name,
          color: env.color,
          variables: Object.entries(env.variables).map(([key, value]) => ({
            key,
            value,
            secret: /token|key|secret|password/i.test(key),
          })),
        }));
    }

    if (environments.length === 0) {
      throw new Error('No environments selected for export. Check at least one environment on the Environments page.');
    }

    const payload = {
      version: 1,
      exportedAt: new Date().toISOString(),
      projectName,
      environments,
    };

    const defaultPath = `${projectName.replace(/\s+/g, '-').toLowerCase()}-environments.json`;
    const result = await vscode.window.showSaveDialog({
      title: 'Export Environments',
      defaultUri: vscode.Uri.file(defaultPath),
      filters: { 'JSON File': ['json'] },
    });

    if (!result) return { success: false, canceled: true };

    writeFileSync(result.fsPath, JSON.stringify(payload, null, 2), 'utf-8');
    return { success: true, filePath: result.fsPath };
  }

  async importEnvironments(projectId: string): Promise<{ success: boolean; canceled?: boolean; imported?: number }> {
    const result = await vscode.window.showOpenDialog({
      title: 'Import Environments',
      canSelectMany: false,
      filters: { 'JSON File': ['json'] },
    });

    if (!result?.[0]) return { success: false, canceled: true };

    const content = readFileSync(result[0].fsPath, 'utf-8');
    let parsed: {
      environments?: {
        name: string;
        color?: string;
        variables?: { key: string; value: string; secret?: boolean }[];
      }[];
    };

    try {
      parsed = JSON.parse(content);
    } catch {
      throw new Error('Invalid JSON file');
    }

    const items = parsed.environments ?? [];
    if (items.length === 0) throw new Error('No environments found in file');

    if (this.canUseDatabase()) {
      const existingNames = new Set(listEnvironments(projectId).map((e) => e.name.toLowerCase()));
      let imported = 0;

      for (const item of items) {
        const baseName = item.name?.trim();
        if (!baseName) continue;

        let name = baseName;
        let suffix = 1;
        while (existingNames.has(name.toLowerCase())) {
          name = `${baseName} (${suffix++})`;
        }
        existingNames.add(name.toLowerCase());

        const color = item.color ?? '#2563EB';
        const created = createEnvironment(projectId, name, color);

        for (const v of item.variables ?? []) {
          if (!v.key?.trim()) continue;
          upsertEnvVariable(projectId, created.id, v.key.trim(), v.value ?? '', v.secret ?? false);
        }
        imported++;
      }

      return { success: true, imported };
    }

    const state = await this.buildFallbackState();
    const existingNames = new Set(state.environments.map((e) => e.name.toLowerCase()));
    let imported = 0;

    for (const item of items) {
      const baseName = item.name?.trim();
      if (!baseName) continue;

      let name = baseName;
      let suffix = 1;
      while (existingNames.has(name.toLowerCase())) {
        name = `${baseName} (${suffix++})`;
      }
      existingNames.add(name.toLowerCase());

      const variables: Record<string, string> = {};
      for (const v of item.variables ?? []) {
        if (v.key?.trim()) variables[v.key.trim()] = v.value ?? '';
      }

      state.environments.push({
        id: `env-${Date.now().toString(36)}-${imported}`,
        name,
        color: item.color ?? '#2563EB',
        variables,
        includeInExport: true,
      });
      imported++;
    }

    this.syncFallbackProjectFromState(state);
    await this.context.globalState.update(FALLBACK_STATE_KEY, state);
    return { success: true, imported };
  }

  async createEnvironmentInProject(projectId: string, name: string, color: string): Promise<{ id: string }> {
    if (this.canUseDatabase()) {
      const created = createEnvironment(projectId, name, color);
      this.ensureActiveEnvironmentSetting(projectId, created.id);
      return { id: created.id };
    }
    return this.mutateFallbackEnvironments(async (state) => {
      const id = `env-${Date.now().toString(36)}`;
      state.environments.push({
        id,
        name: name.trim(),
        color,
        variables: variablesForNewEnvironment(),
        includeInExport: true,
      });
      if (
        !state.activeEnvironmentId ||
        !state.environments.some((e) => e.id === state.activeEnvironmentId)
      ) {
        state.activeEnvironmentId = id;
      }
      return id;
    });
  }

  private ensureActiveEnvironmentSetting(projectId: string, newEnvironmentId: string): void {
    try {
      const active = getSetting('activeEnvironment');
      const envs = listEnvironments(projectId);
      if (!active || !envs.some((e) => e.id === active)) {
        setSetting('activeEnvironment', newEnvironmentId);
      }
    } catch (err) {
      this.markDbUnavailable(err);
    }
  }

  updateEnvironmentInProject(
    projectId: string,
    environmentId: string,
    data: { name?: string; color?: string }
  ) {
    if (this.canUseDatabase()) {
      return updateEnvironment(projectId, environmentId, data);
    }
    return this.mutateFallbackEnvironments(async (state) => {
      const env = state.environments.find((e) => e.id === environmentId);
      if (!env) throw new Error('Environment not found');
      if (data.name?.trim()) env.name = data.name.trim();
      if (data.color) env.color = data.color;
      return environmentId;
    });
  }

  duplicateEnvironmentInProject(
    projectId: string,
    sourceId: string,
    name: string,
    color?: string
  ) {
    if (this.canUseDatabase()) {
      return duplicateEnvironment(projectId, sourceId, name, color);
    }
    return this.mutateFallbackEnvironments(async (state) => {
      const source = state.environments.find((e) => e.id === sourceId);
      if (!source) throw new Error('Source environment not found');
      const id = `env-${Date.now().toString(36)}`;
      state.environments.push({
        id,
        name: name.trim(),
        color: color ?? source.color,
        variables: { ...source.variables },
        includeInExport: source.includeInExport !== false,
      });
      return id;
    });
  }

  deleteEnvironmentInProject(projectId: string, environmentId: string) {
    if (this.canUseDatabase()) {
      return this.deleteEnvironment(projectId, environmentId);
    }
    return this.mutateFallbackEnvironments(async (state) => {
      const idx = state.environments.findIndex((e) => e.id === environmentId);
      if (idx < 0) throw new Error('Environment not found');
      state.environments.splice(idx, 1);
      if (state.activeEnvironmentId === environmentId) {
        state.activeEnvironmentId = state.environments[0]?.id ?? '';
      }
      return environmentId;
    });
  }

  private async mutateFallbackEnvironments(
    fn: (state: AppState) => Promise<string> | string
  ): Promise<{ id: string }> {
    const state = await this.buildFallbackState();
    const id = await fn(state);
    this.syncFallbackProjectFromState(state);
    await this.context.globalState.update(FALLBACK_STATE_KEY, state);
    return { id };
  }

  // --- Collections ---
  listCollections(projectId: string) {
    if (!this.canUseDatabase()) {
      const project = this.getFallbackProject(projectId);
      return project.folders.map((f) => ({
        id: f.id,
        name: f.name,
        protocol: f.protocol ?? 'http',
        requests: f.requests.map((r) => ({
          id: r.id,
          name: r.name,
          method: r.method,
          url: r.url,
          protocol: r.protocol ?? f.protocol ?? 'http',
        })),
      }));
    }
    return listCollectionsForProject(projectId);
  }

  createCollection(projectId: string, name: string, protocol?: string): CollectionDto {
    const p = protocol ?? 'http';
    if (!this.canUseDatabase()) {
      return this.mutateFallbackProjectSync(projectId, (project) => {
        const col = {
          id: `col-${Date.now().toString(36)}`,
          name: name.trim(),
          expanded: true,
          protocol: p,
          requests: [] as ApiRequest[],
        };
        project.folders.push(col);
        return { id: col.id, name: col.name, protocol: col.protocol, requests: [] };
      });
    }
    try {
      return createCollection(projectId, name, p);
    } catch (err) {
      this.markDbUnavailable(err);
      return this.mutateFallbackProjectSync(projectId, (project) => {
        const col = {
          id: `col-${Date.now().toString(36)}`,
          name: name.trim(),
          expanded: true,
          protocol: p,
          requests: [] as ApiRequest[],
        };
        project.folders.push(col);
        return { id: col.id, name: col.name, protocol: col.protocol, requests: [] };
      });
    }
  }

  updateCollection(projectId: string, collectionId: string, data: { name?: string }) {
    if (!this.canUseDatabase()) {
      return this.mutateFallbackProjectSync(projectId, (project) => {
        const col = project.folders.find((f) => f.id === collectionId);
        if (!col) throw new Error('Collection not found');
        if (data.name?.trim()) col.name = data.name.trim();
        return { id: col.id, name: col.name, protocol: col.protocol ?? 'http', requests: col.requests };
      });
    }
    const updated = updateCollection(projectId, collectionId, data);
    if (!updated) throw new Error('Collection not found');
    return updated;
  }

  deleteCollection(projectId: string, collectionId: string) {
    if (!this.canUseDatabase()) {
      this.mutateFallbackProjectSync(projectId, (project) => {
        const idx = project.folders.findIndex((f) => f.id === collectionId);
        if (idx < 0) throw new Error('Collection not found');
        project.folders.splice(idx, 1);
        return true;
      });
      return { success: true };
    }
    const deleted = deleteCollection(projectId, collectionId);
    if (!deleted) throw new Error('Collection not found');
    return { success: true };
  }

  ensureProtocolCollection(projectId: string, protocol: Protocol) {
    const normalized = normalizeProtocol(protocol);
    if (!this.canUseDatabase()) {
      const store = this.loadFallbackProjectsStore();
      const project = store.projects.find((p) => p.id === projectId);
      if (!project) throw new Error('Project not found');
      let col = project.folders.find((f) => normalizeProtocol(f.protocol) === normalized);
      if (!col) {
        col = {
          id: `col-${Date.now().toString(36)}`,
          name: defaultCollectionNameForProtocol(normalized),
          expanded: true,
          protocol: normalized,
          requests: [],
        };
        project.folders.push(col);
        this.saveFallbackProjectsStore(store);
      }
      return {
        id: col.id,
        name: col.name,
        protocol: col.protocol ?? normalized,
        requests: col.requests,
      };
    }
    const project = getProjectById(projectId);
    if (!project) throw new Error('Project not found');
    const existing = project.collections.find((c) => normalizeProtocol(c.protocol) === normalized);
    if (existing) return existing;
    return createCollection(projectId, defaultCollectionNameForProtocol(normalized), normalized);
  }

  createRequestInCollection(
    projectId: string,
    collectionId: string,
    protocol?: Protocol
  ): RequestDto {
    const p = normalizeProtocol(protocol ?? 'http');
    if (!this.canUseDatabase()) {
      return this.mutateFallbackProjectSync(projectId, (project) => {
        const folder = project.folders.find((f) => f.id === collectionId);
        if (!folder) throw new Error('Collection not found');
        const req: ApiRequest = {
          id: `req-${Date.now().toString(36)}`,
          name: defaultNameForProtocol(p),
          method: defaultMethodForProtocol(p),
          url: defaultUrlForProtocol(p),
          protocol: p,
          params: [{ id: uid(), key: '', value: '', enabled: true }],
          headers: [
            { id: uid(), key: 'Accept', value: 'application/json', enabled: true },
            { id: uid(), key: '', value: '', enabled: true },
          ],
          authType: 'none',
          authToken: '',
          body: '',
          folderId: collectionId,
        };
        if (p === 'graphql') {
          req.graphqlQuery = DEFAULT_GRAPHQL_QUERY;
          req.graphqlVariables = '{}';
        }
        if (p === 'soap') {
          applySoapDefaults(req);
        }
        folder.requests.push(req);
        return {
          id: req.id,
          name: req.name,
          method: req.method,
          url: req.url,
          protocol: p,
          requestConfig: '{}',
        };
      });
    }

    try {
      const req = createRequest(
        projectId,
        collectionId,
        defaultNameForProtocol(p),
        defaultMethodForProtocol(p),
        defaultUrlForProtocol(p),
        p
      );

      if (p === 'graphql') {
        const config = parseRequestConfig(null);
        config.bodyType = 'json';
        config.body = JSON.stringify({ query: DEFAULT_GRAPHQL_QUERY, variables: undefined }, null, 2);
        updateRequest(projectId, req.id, {
          requestConfig: JSON.stringify(config),
        });
      }

      if (p === 'soap') {
        const config = parseRequestConfig(null);
        config.bodyType = 'xml';
        config.body = DEFAULT_SOAP_ENVELOPE;
        config.soapAction = DEFAULT_SOAP_ACTION;
        config.soapContentType = 'text/xml';
        updateRequest(projectId, req.id, {
          requestConfig: JSON.stringify(config),
        });
      }

      return req;
    } catch (err) {
      this.markDbUnavailable(err);
      return this.mutateFallbackProjectSync(projectId, (project) => {
        const folder = project.folders.find((f) => f.id === collectionId);
        if (!folder) throw new Error('Collection not found');
        const req: ApiRequest = {
          id: `req-${Date.now().toString(36)}`,
          name: defaultNameForProtocol(p),
          method: defaultMethodForProtocol(p),
          url: defaultUrlForProtocol(p),
          protocol: p,
          params: [{ id: uid(), key: '', value: '', enabled: true }],
          headers: [
            { id: uid(), key: 'Accept', value: 'application/json', enabled: true },
            { id: uid(), key: '', value: '', enabled: true },
          ],
          authType: 'none',
          authToken: '',
          body: '',
          folderId: collectionId,
        };
        if (p === 'graphql') {
          req.graphqlQuery = DEFAULT_GRAPHQL_QUERY;
          req.graphqlVariables = '{}';
        }
        if (p === 'soap') {
          applySoapDefaults(req);
        }
        folder.requests.push(req);
        return {
          id: req.id,
          name: req.name,
          method: req.method,
          url: req.url,
          protocol: p,
          requestConfig: '{}',
        };
      });
    }
  }

  deleteRequest(projectId: string, requestId: string) {
    if (!this.canUseDatabase()) {
      this.mutateFallbackProjectSync(projectId, (project) => {
        for (const folder of project.folders) {
          const idx = folder.requests.findIndex((r) => r.id === requestId);
          if (idx >= 0) {
            folder.requests.splice(idx, 1);
            return true;
          }
        }
        throw new Error('Request not found');
      });
      return { success: true };
    }
    deleteRequest(projectId, requestId);
    return { success: true };
  }

  // --- Import / Export ---
  private getExportEnvironments(projectId: string, environmentIds?: string[]): ExportEnvironment[] {
    const filterByIds = (id: string) => !environmentIds?.length || environmentIds.includes(id);

    if (this.canUseDatabase()) {
      try {
        return listEnvironments(projectId)
          .filter((env) => filterByIds(env.id))
          .map((env) => ({
            name: env.name,
            color: env.color,
            variables: getEnvVariables(projectId, env.id).map((v) => ({
              key: v.key,
              value: v.value,
              secret: v.secret,
            })),
          }));
      } catch (err) {
        this.markDbUnavailable(err);
      }
    }

    const project = this.getFallbackProject(projectId);
    return project.environments
      .filter((env) => filterByIds(env.id))
      .map((env) => ({
        name: env.name,
        color: env.color,
        variables: Object.entries(env.variables).map(([key, value]) => ({
          key,
          value,
          secret: /token|key|secret|password/i.test(key),
        })),
      }));
  }

  async exportProject(
    projectId: string,
    format: string,
    options?: { collectionId?: string | null; includeEnvironments?: boolean; environmentIds?: string[] }
  ): Promise<{ success: boolean; canceled?: boolean; filePath?: string }> {
    const project = this.getProject(projectId);
    if (!project) throw new Error('Project not found');

    let collections = project.collections;
    if (options?.collectionId) {
      const col = collections.find((c) => c.id === options.collectionId);
      if (!col) throw new Error('Collection not found');
      collections = [col];
    }
    if (collections.length === 0) throw new Error('No collections to export');

    const environments = options?.includeEnvironments
      ? this.getExportEnvironments(projectId, options.environmentIds)
      : undefined;
    const { content, extension } = serializeExport(format, project, collections, environments);
    const defaultPath = defaultFilename(
      project.name,
      options?.collectionId ? collections[0].name : null,
      extension
    );

    const result = await vscode.window.showSaveDialog({
      title: options?.collectionId ? 'Export Collection' : 'Export Project',
      defaultUri: vscode.Uri.file(defaultPath),
      filters: { 'Export File': [extension.split('.').pop() || 'json'] },
    });

    if (!result) return { success: false, canceled: true };

    writeFileSync(result.fsPath, content, 'utf-8');
    return { success: true, filePath: result.fsPath };
  }

  async exportCollection(
    projectId: string,
    format: string,
    collectionId?: string | null,
    includeEnvironments = false,
    environmentIds?: string[]
  ): Promise<{ success: boolean; canceled?: boolean; filePath?: string }> {
    return this.exportProject(projectId, format, { collectionId, includeEnvironments, environmentIds });
  }

  async fetchWsdl(url: string): Promise<WsdlParseResult> {
    const trimmed = url.trim();
    if (!trimmed) throw new Error('WSDL URL is required');

    const wsdlUrl =
      trimmed.includes('?wsdl') || trimmed.toLowerCase().endsWith('.wsdl')
        ? trimmed
        : `${trimmed.replace(/\/$/, '')}?wsdl`;

    const res = await fetch(wsdlUrl);
    if (!res.ok) {
      throw new Error(`Failed to fetch WSDL (${res.status} ${res.statusText})`);
    }

    const text = await res.text();
    const parsed = parseWsdl(text);
    if (parsed.operations.length === 0) {
      throw new Error('No SOAP operations found in WSDL');
    }
    return parsed;
  }

  private importCollectionsIntoFallback(
    projectId: string,
    collections: ImportCollection[],
    environments?: ImportEnvironment[]
  ): Omit<ImportResult, 'success' | 'canceled'> {
    let requestsCreated = 0;
    const collectionNames: string[] = [];
    let environmentsImported = 0;

    this.mutateFallbackProjectSync(projectId, (project) => {
      for (const col of collections) {
        const name = col.name.trim() || 'Imported Collection';
        const protocol = col.protocol ?? 'http';
        const folder = {
          id: `col-${Date.now().toString(36)}-${collectionNames.length}`,
          name,
          expanded: true,
          protocol,
          requests: [] as ApiRequest[],
        };

        for (const req of col.requests) {
          folder.requests.push({
            id: `req-${Date.now().toString(36)}-${requestsCreated}`,
            name: req.name,
            method: req.method as ApiRequest['method'],
            url: req.url || '{{BASE_URL}}',
            protocol: req.protocol ?? protocol,
            params: [],
            headers: [{ id: uid(), key: 'Accept', value: 'application/json', enabled: true }],
            authType: 'none',
            authToken: '',
            body: '',
            folderId: folder.id,
          });
          requestsCreated++;
        }

        project.folders.push(folder);
        collectionNames.push(name);
      }

      if (environments?.length) {
        const existingNames = new Set(project.environments.map((e) => e.name.toLowerCase()));
        for (const item of environments) {
          const baseName = item.name.trim();
          if (!baseName) continue;

          let name = baseName;
          let suffix = 1;
          while (existingNames.has(name.toLowerCase())) {
            name = `${baseName} (${suffix++})`;
          }
          existingNames.add(name.toLowerCase());

          const variables: Record<string, string> = {};
          for (const v of item.variables ?? []) {
            if (v.key?.trim()) variables[v.key.trim()] = v.value ?? '';
          }

          project.environments.push({
            id: `env-${Date.now().toString(36)}-${environmentsImported}`,
            name,
            color: item.color ?? '#2563EB',
            variables,
          });
          environmentsImported++;
        }
      }

      return true;
    });

    return {
      collectionsCreated: collectionNames.length,
      requestsCreated,
      environmentsImported,
      collectionNames,
    };
  }

  async importCollection(projectId: string, format: string): Promise<ImportResult> {
    const result = await vscode.window.showOpenDialog({
      title: 'Import Collection',
      canSelectMany: false,
      filters: Object.fromEntries(importFileFilters(format).map((f) => [f.name, f.extensions])),
    });

    if (!result?.[0]) return { success: false, canceled: true };

    const content = readFileSync(result[0].fsPath, 'utf-8');
    const collections = parseImportContent(format, content);
    if (collections.length === 0) throw new Error('No collections found in file');

    let environments: ImportEnvironment[] = [];
    if (format === 'json') {
      try {
        environments = extractEnvironmentsFromExport(JSON.parse(content));
      } catch {
        environments = [];
      }
    }

    if (this.canUseDatabase()) {
      try {
        const imported = importCollectionsIntoProject(projectId, collections);
        let environmentsImported = 0;
        if (environments.length > 0) {
          const existingNames = new Set(listEnvironments(projectId).map((e) => e.name.toLowerCase()));
          for (const item of environments) {
            const baseName = item.name.trim();
            if (!baseName) continue;
            let name = baseName;
            let suffix = 1;
            while (existingNames.has(name.toLowerCase())) {
              name = `${baseName} (${suffix++})`;
            }
            existingNames.add(name.toLowerCase());
            const created = createEnvironment(projectId, name, item.color ?? '#2563EB');
            for (const v of item.variables ?? []) {
              if (!v.key?.trim()) continue;
              upsertEnvVariable(projectId, created.id, v.key.trim(), v.value ?? '', v.secret ?? false);
            }
            environmentsImported++;
          }
        }
        return { success: true, ...imported, environmentsImported };
      } catch (err) {
        this.markDbUnavailable(err);
      }
    }

    const imported = this.importCollectionsIntoFallback(projectId, collections, environments);
    return { success: true, ...imported };
  }

  async previewDocsLocal(projectId: string, environmentIds?: string[]): Promise<{ htmlPath: string; endpointCount: number }> {
    const project = this.getProject(projectId);
    if (!project) throw new Error('Project not found');

    const environments = this.getExportEnvironments(projectId, environmentIds);
    const doc = buildApiDocumentation(project, environments);
    const spec = buildOpenApi(project, project.collections, environments) as unknown as OpenApiSpec;
    const docsDir = join(this.context.globalStorageUri.fsPath, 'docs-preview', projectId);
    mkdirSync(docsDir, { recursive: true });
    const htmlPath = join(docsDir, 'index.html');
    writeFileSync(htmlPath, generateRichApiDocsHtml(doc, new Date()), 'utf-8');
    writeFileSync(join(docsDir, 'openapi.json'), JSON.stringify(spec, null, 2), 'utf-8');

    const endpointCount = Object.entries(spec.paths ?? {}).reduce(
      (n, [, methods]) => n + Object.keys(methods as object).filter((m) => m !== 'parameters').length,
      0
    );

    await vscode.env.openExternal(vscode.Uri.file(htmlPath));
    return { htmlPath, endpointCount };
  }

  // --- Git ---
  getGitStatus(projectId: string) {
    return getGitStatus(projectId);
  }

  initGitRepo(projectId: string) {
    return initGitRepo(projectId);
  }

  async chooseGitRepo(projectId: string) {
    const result = await vscode.window.showOpenDialog({
      title: 'Choose Git Repository Folder',
      canSelectFiles: false,
      canSelectFolders: true,
      canSelectMany: false,
      openLabel: 'Select Repository',
    });
    if (!result?.[0]) {
      return { canceled: true, status: await getGitStatus(projectId) };
    }
    setGitRepoPath(projectId, result[0].fsPath);
    return { canceled: false, status: await getGitStatus(projectId) };
  }

  setGitRemote(projectId: string, remoteUrl: string) {
    return setGitRemote(projectId, remoteUrl);
  }

  async syncToGit(projectId: string, environmentIds?: string[]) {
    const status = await getGitStatus(projectId);
    if (!status.repoPath) throw new Error('Set up a Git repository first');
    const project = this.getProject(projectId);
    if (!project) throw new Error('Project not found');
    const environments = this.getExportEnvironments(projectId, environmentIds);
    const stats = syncProjectDataToRepo(project, status.repoPath, environments);
    await gitStageAll(projectId);
    return { ...stats, status: await getGitStatus(projectId) };
  }

  gitCommit(projectId: string, message: string, amend = false) {
    return gitCommit(projectId, message, amend);
  }

  gitStage(projectId: string, paths: string[]) {
    return gitStage(projectId, paths);
  }

  gitUnstage(projectId: string, paths: string[]) {
    return gitUnstage(projectId, paths);
  }

  gitStageAll(projectId: string) {
    return gitStageAll(projectId);
  }

  gitUnstageAll(projectId: string) {
    return gitUnstageAll(projectId);
  }

  getGitDiff(projectId: string, filePath: string, staged?: boolean) {
    return getGitDiff(projectId, filePath, staged);
  }

  gitPush(projectId: string) {
    return gitPush(projectId);
  }

  async gitPull(projectId: string) {
    const status = await gitPull(projectId);
    let imported = null;
    try {
      imported = this.importFromRepo(projectId);
    } catch {
      imported = null;
    }
    return { status, imported };
  }

  async gitClone(projectId: string, remoteUrl: string) {
    const pick = await vscode.window.showOpenDialog({
      title: 'Clone Into Folder',
      canSelectFiles: false,
      canSelectFolders: true,
      canSelectMany: false,
    });
    if (!pick?.[0]) {
      return { canceled: true, status: await getGitStatus(projectId), imported: null };
    }
    const status = await gitClone(projectId, remoteUrl, pick[0].fsPath);
    let imported = null;
    try {
      imported = this.importFromRepo(projectId);
    } catch {
      imported = null;
    }
    return { canceled: false, status, imported };
  }

  async importFromRepo(projectId: string) {
    const status = await getGitStatus(projectId);
    if (!status.repoPath) throw new Error('Set up a Git repository first');
    const content = readRepoCollectionsFile(status.repoPath);
    if (!content) return null;
    const collections = parseImportContent('json', content);
    if (collections.length === 0) return null;

    let environments: ImportEnvironment[] = [];
    try {
      environments = extractEnvironmentsFromExport(JSON.parse(content));
    } catch {
      environments = [];
    }

    if (this.canUseDatabase()) {
      try {
        const imported = importCollectionsIntoProject(projectId, collections);
        let environmentsImported = 0;
        if (environments.length > 0) {
          const existingNames = new Set(listEnvironments(projectId).map((e) => e.name.toLowerCase()));
          for (const item of environments) {
            const baseName = item.name.trim();
            if (!baseName) continue;
            let name = baseName;
            let suffix = 1;
            while (existingNames.has(name.toLowerCase())) {
              name = `${baseName} (${suffix++})`;
            }
            existingNames.add(name.toLowerCase());
            const created = createEnvironment(projectId, name, item.color ?? '#2563EB');
            for (const v of item.variables ?? []) {
              if (!v.key?.trim()) continue;
              upsertEnvVariable(projectId, created.id, v.key.trim(), v.value ?? '', v.secret ?? false);
            }
            environmentsImported++;
          }
        }
        return { ...imported, environmentsImported };
      } catch (err) {
        this.markDbUnavailable(err);
      }
    }

    return this.importCollectionsIntoFallback(projectId, collections, environments);
  }

  async publishDocs(projectId: string, environmentIds?: string[]) {
    const status = await getGitStatus(projectId);
    if (!status.repoPath || !status.isRepo) {
      throw new Error('Set up a Git repository first on the Git Sync page');
    }

    const project = this.getProject(projectId);
    if (!project) throw new Error('Project not found');

    const environments = this.getExportEnvironments(projectId, environmentIds);
    if (environments.length === 0) {
      throw new Error('No environments selected for documentation. Check at least one environment on the Environments page.');
    }
    const doc = buildApiDocumentation(project, environments);
    const spec = buildOpenApi(project, project.collections, environments) as unknown as OpenApiSpec;
    const publishedAt = new Date();
    const docsDir = join(status.repoPath, 'docs');
    mkdirSync(docsDir, { recursive: true });
    writeFileSync(join(status.repoPath, 'openapi.json'), JSON.stringify(spec, null, 2), 'utf-8');
    const htmlPath = join(docsDir, 'index.html');
    writeFileSync(htmlPath, generateRichApiDocsHtml(doc, publishedAt), 'utf-8');
    writeFileSync(
      join(docsDir, 'README.md'),
      `# API Documentation\n\nOpen \`index.html\` in a browser or enable GitHub Pages from \`/docs\`.\n\nLast published: ${publishedAt.toISOString()}\n`,
      'utf-8'
    );
    return {
      htmlPath,
      openapiPath: join(status.repoPath, 'openapi.json'),
      endpointCount: doc.endpoints.length,
      title: doc.title,
      publishedAt: publishedAt.toISOString(),
      status: await getGitStatus(projectId),
    };
  }

  async previewDocs(projectId: string, environmentIds?: string[]) {
    const status = await getGitStatus(projectId);
    if (!status.repoPath || !status.isRepo) {
      return { ...(await this.previewDocsLocal(projectId, environmentIds)), status };
    }
    let htmlPath = getPublishedDocsPath(status.repoPath);
    if (!htmlPath) {
      const project = this.getProject(projectId);
      if (!project) throw new Error('Project not found');
      const environments = this.getExportEnvironments(projectId, environmentIds);
      if (environments.length === 0) {
        throw new Error('No environments selected for documentation. Check at least one environment on the Environments page.');
      }
      const doc = buildApiDocumentation(project, environments);
      const spec = buildOpenApi(project, project.collections, environments) as unknown as OpenApiSpec;
      const publishedAt = new Date();
      const docsDir = join(status.repoPath, 'docs');
      mkdirSync(docsDir, { recursive: true });
      writeFileSync(join(status.repoPath, 'openapi.json'), JSON.stringify(spec, null, 2), 'utf-8');
      htmlPath = join(docsDir, 'index.html');
      writeFileSync(htmlPath, generateRichApiDocsHtml(doc, publishedAt), 'utf-8');
    }
    await vscode.env.openExternal(vscode.Uri.file(htmlPath));
    return { htmlPath, status: await getGitStatus(projectId) };
  }

  async openGitFolder(projectId: string) {
    const status = await getGitStatus(projectId);
    if (!status.repoPath) throw new Error('Repository folder not found');
    await vscode.env.openExternal(vscode.Uri.file(status.repoPath));
    return { success: true };
  }

  private readExplicitFallbackProjectsStore(): FallbackProjectsStore | null {
    const fromFile = this.jsonStore.load();
    if (fromFile !== null) return fromFile;

    const fromGlobal = this.context.globalState.get<FallbackProjectsStore>(FALLBACK_PROJECTS_KEY);
    if (fromGlobal !== undefined) return fromGlobal;

    for (const key of LEGACY_FALLBACK_PROJECTS_KEYS) {
      const legacy = this.context.globalState.get<FallbackProjectsStore>(key);
      if (legacy !== undefined) return legacy;
    }

    return null;
  }

  private deleteAppSetting(key: string): void {
    if (this.canUseDatabase()) {
      try {
        deleteSetting(key);
        return;
      } catch (err) {
        this.markDbUnavailable(err);
      }
    }

    const existing = this.readExplicitFallbackProjectsStore();
    if (!existing?.settings?.[key]) return;
    const store = { ...existing, settings: { ...existing.settings } };
    delete store.settings[key];
    this.saveFallbackProjectsStore(store);
  }

  private clearActiveEnvironmentForProject(projectId: string): void {
    if (!this.canUseDatabase()) return;

    try {
      const activeEnv = getSetting('activeEnvironment');
      if (!activeEnv) return;
      const envs = listEnvironments(projectId);
      if (envs.some((env) => env.id === activeEnv)) {
        deleteSetting('activeEnvironment');
      }
    } catch (err) {
      this.markDbUnavailable(err);
    }
  }

  private collectProjectStoragePaths(projectId: string): string[] {
    const paths = new Set<string>();
    try {
      const configuredRepo = getGitRepoPath(projectId);
      if (configuredRepo) paths.add(configuredRepo);
    } catch {
      /* ignore */
    }
    try {
      paths.add(defaultGitRepoPath(projectId));
    } catch {
      /* ignore */
    }
    paths.add(join(this.context.globalStorageUri.fsPath, 'docs-preview', projectId));
    return [...paths];
  }

  private removeDirectory(path: string): void {
    try {
      if (existsSync(path)) {
        rmSync(path, { recursive: true, force: true });
      }
    } catch (err) {
      console.error(`[${APP_NAME}] Failed to remove directory ${path}:`, err);
    }
  }

  private purgeProjectRelatedData(projectId: string, wasActive: boolean): void {
    const storagePaths = this.collectProjectStoragePaths(projectId);
    this.deleteAppSetting(`gitRepoPath:${projectId}`);
    this.purgeDeletedProjectFromFallback(projectId);

    if (wasActive) {
      this.deleteAppSetting('activeEnvironment');
    } else {
      this.clearActiveEnvironmentForProject(projectId);
    }

    for (const path of storagePaths) {
      this.removeDirectory(path);
    }
  }

  private purgeDeletedProjectFromFallback(projectId: string): void {
    const existing = this.readExplicitFallbackProjectsStore();
    const store: FallbackProjectsStore = existing
      ? {
          ...existing,
          projects: existing.projects.filter((p) => p.id !== projectId),
        }
      : { activeProjectId: '', projects: [] };

    if (store.activeProjectId === projectId) {
      store.activeProjectId = store.projects[0]?.id ?? '';
    }
    this.projectId = store.activeProjectId;
    this.saveFallbackProjectsStore(store);

    const legacyStateKeys = [FALLBACK_STATE_KEY, ...LEGACY_FALLBACK_STATE_KEYS];
    for (const key of legacyStateKeys) {
      const saved = this.context.globalState.get<AppState>(key);
      if (saved?.projectId === projectId) {
        void this.context.globalState.update(key, undefined);
      }
    }
  }

  private loadFallbackProjectsStore(): FallbackProjectsStore {
    const explicit = this.readExplicitFallbackProjectsStore();
    if (explicit !== null) {
      const cleaned = this.sanitizeFallbackProjectsStore(explicit);
      if (
        cleaned.projects.length !== explicit.projects.length ||
        cleaned.activeProjectId !== explicit.activeProjectId ||
        JSON.stringify(cleaned.projects) !== JSON.stringify(explicit.projects)
      ) {
        this.saveFallbackProjectsStore(cleaned);
      }
      return cleaned;
    }

    const legacy =
      this.context.globalState.get<AppState>(FALLBACK_STATE_KEY) ??
      this.getLegacyGlobalState<AppState>(LEGACY_FALLBACK_STATE_KEYS);
    if (legacy?.projectId && !isLegacyMockProject({
      id: legacy.projectId,
      name: legacy.projectName,
      description: legacy.projectDescription,
      collectionCount: legacy.folders?.length ?? 0,
      requestCount: legacy.folders?.reduce((n, f) => n + (f.requests?.length ?? 0), 0) ?? 0,
    })) {
      const store: FallbackProjectsStore = {
        activeProjectId: legacy.projectId,
        projects: [{
          id: legacy.projectId,
          name: legacy.projectName,
          description: legacy.projectDescription ?? '',
          folders: legacy.folders,
          environments: legacy.environments,
          activeEnvironmentId: legacy.activeEnvironmentId,
        }],
      };
      this.saveFallbackProjectsStore(store);
      return store;
    }

    const store: FallbackProjectsStore = { activeProjectId: '', projects: [] };
    this.saveFallbackProjectsStore(store);
    return store;
  }

  private sanitizeFallbackProject(project: FallbackProjectData): FallbackProjectData {
    const environments = project.environments
      .filter((env) => !isLegacyMockEnvironment({ id: env.id, name: env.name, variables: env.variables }))
      .map((env) => ({ ...env }));
    const activeEnvironmentId = environments.some((e) => e.id === project.activeEnvironmentId)
      ? project.activeEnvironmentId
      : (environments[0]?.id ?? '');

    return {
      ...project,
      environments,
      activeEnvironmentId,
    };
  }

  private sanitizeFallbackProjectsStore(store: FallbackProjectsStore): FallbackProjectsStore {
    const projects = store.projects
      .filter((p) =>
        !isLegacyMockProject({
          id: p.id,
          name: p.name,
          description: p.description,
          collectionCount: p.folders.length,
          requestCount: p.folders.reduce((n, f) => n + f.requests.length, 0),
        })
      )
      .map((p) => this.sanitizeFallbackProject(p));
    const activeProjectId = projects.some((p) => p.id === store.activeProjectId)
      ? store.activeProjectId
      : (projects[0]?.id ?? '');
    const cleaned = { ...store, projects, activeProjectId };
    if (
      cleaned.projects.length !== store.projects.length ||
      cleaned.activeProjectId !== store.activeProjectId ||
      JSON.stringify(cleaned.projects) !== JSON.stringify(store.projects)
    ) {
      this.saveFallbackProjectsStore(cleaned);
    }
    return cleaned;
  }

  private saveFallbackProjectsStore(store: FallbackProjectsStore): void {
    void this.context.globalState.update(FALLBACK_PROJECTS_KEY, store);
    try {
      this.jsonStore.save(store);
    } catch (err) {
      console.error(`[${APP_NAME}] Failed to write JSON store:`, err);
    }
  }

  private getFallbackProject(projectId: string): FallbackProjectData {
    const store = this.loadFallbackProjectsStore();
    const project = store.projects.find((p) => p.id === projectId);
    if (!project) throw new Error('Project not found');
    return project;
  }

  private mutateFallbackProjectSync<T>(
    projectId: string,
    fn: (project: FallbackProjectData) => T
  ): T {
    const store = this.loadFallbackProjectsStore();
    const project = store.projects.find((p) => p.id === projectId);
    if (!project) throw new Error('Project not found');
    const result = fn(project);
    this.saveFallbackProjectsStore(store);
    return result;
  }

  private syncFallbackProjectFromState(state: AppState): void {
    if (!state.projectId?.trim()) return;

    const store = this.loadFallbackProjectsStore();
    const idx = store.projects.findIndex((p) => p.id === state.projectId);
    const data: FallbackProjectData = {
      id: state.projectId,
      name: state.projectName,
      description: state.projectDescription ?? '',
      folders: state.folders,
      environments: state.environments,
      activeEnvironmentId: state.activeEnvironmentId,
    };
    if (idx >= 0) {
      store.projects[idx] = data;
    } else {
      store.projects.push(data);
    }
    store.activeProjectId = state.projectId;
    this.projectId = state.projectId;
    this.saveFallbackProjectsStore(store);
  }

  private createFallbackProject(name: string, description?: string) {
    const store = this.loadFallbackProjectsStore();

    const trimmedName = name.trim();
    if (!trimmedName) throw new Error('Project name is required');

    const id = `proj-${Date.now().toString(36)}`;

    const newProject: FallbackProjectData = {
      id,
      name: trimmedName,
      description: description?.trim() ?? '',
      folders: [],
      environments: [],
      activeEnvironmentId: '',
    };

    store.projects.push(newProject);
    store.activeProjectId = id;
    this.projectId = id;
    this.saveFallbackProjectsStore(store);

    return {
      id,
      name: trimmedName,
      description: newProject.description,
      collections: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
  }

  private async buildFallbackState(): Promise<AppState> {
    const store = this.loadFallbackProjectsStore();
    const active = store.projects.find((p) => p.id === store.activeProjectId) ?? store.projects[0];
    const history = await this.uiStore.loadHistory();
    const ui = await this.uiStore.loadUi();
    const saved =
      this.context.globalState.get<AppState>(FALLBACK_STATE_KEY) ??
      this.getLegacyGlobalState<AppState>(LEGACY_FALLBACK_STATE_KEYS);

    const base = active
      ? {
          ...createDefaultState(),
          projectId: active.id,
          projectName: active.name,
          projectDescription: active.description,
          folders: active.folders,
          environments: active.environments,
          activeEnvironmentId:
            active.activeEnvironmentId || active.environments[0]?.id || '',
        }
      : createDefaultState();

    this.projectId = base.projectId;

    return this.enrichAppState({
      ...base,
      history,
      openTabs: ui.openTabs.length ? ui.openTabs : saved?.openTabs ?? base.openTabs,
      activeTabId: ui.activeTabId || saved?.activeTabId || base.activeTabId,
      themeMode: ui.themeMode ?? saved?.themeMode ?? base.themeMode,
      language: ui.language ?? saved?.language ?? base.language,
      activeProtocol: ui.activeProtocol ?? saved?.activeProtocol ?? base.activeProtocol,
      activeGraphqlTab: ui.activeGraphqlTab ?? saved?.activeGraphqlTab ?? base.activeGraphqlTab,
      activeRequestTab: ui.activeRequestTab ?? saved?.activeRequestTab ?? base.activeRequestTab,
      activeResponseTab: ui.activeResponseTab ?? saved?.activeResponseTab ?? base.activeResponseTab,
      sidebarNav: normalizeSidebarNav(ui.sidebarNav ?? saved?.sidebarNav ?? base.sidebarNav),
      expandedFolders: ui.expandedFolders.length ? ui.expandedFolders : saved?.expandedFolders ?? base.expandedFolders,
      searchQuery: ui.searchQuery ?? saved?.searchQuery ?? '',
      performance: ui.performance ?? saved?.performance ?? base.performance,
    });
  }
}
