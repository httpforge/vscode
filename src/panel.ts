import * as vscode from 'vscode';

import type { ApiService } from './api-service';

import { UiStore } from './ui-store';

import {

  AppState,

  ExtensionToWebviewMessage,

  WebviewToExtensionMessage,

} from './types';

import { getWebviewHtml } from './webviewHtml';
import { isSystemDark } from './lib/theme';
import { APP_INFO } from './branding';
import { readFileSync } from 'fs';
import { join } from 'path';
import { normalizeProtocol } from './lib/protocol-utils';



export class HttpForgePanel {

  public static currentPanel: HttpForgePanel | undefined;

  public static readonly viewType = 'httpforgePanel';



  private readonly panel: vscode.WebviewPanel;

  private state: AppState | null = null;

  private disposables: vscode.Disposable[] = [];



  private constructor(

    panel: vscode.WebviewPanel,

    private readonly extensionUri: vscode.Uri,

    private readonly api: ApiService

  ) {

    this.panel = panel;

    this.panel.iconPath = {
      light: vscode.Uri.joinPath(extensionUri, 'media', 'icon.png'),
      dark: vscode.Uri.joinPath(extensionUri, 'media', 'icon.png'),
    };

    this.panel.webview.html = getWebviewHtml(this.panel.webview, this.extensionUri);



    this.panel.webview.onDidReceiveMessage(

      (msg: WebviewToExtensionMessage) => this.handleMessage(msg),

      null,

      this.disposables

    );



    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);

    this.disposables.push(
      vscode.window.onDidChangeActiveColorTheme(() => {
        this.post({ type: 'theme', systemIsDark: isSystemDark() });
      })
    );

    vscode.commands.executeCommand('setContext', 'httpforge.panelFocused', true);

    this.panel.onDidChangeViewState((e) => {

      vscode.commands.executeCommand(

        'setContext',

        'httpforge.panelFocused',

        e.webviewPanel.active

      );

    });

  }



  public static async createOrShow(

    extensionUri: vscode.Uri,

    api: ApiService

  ): Promise<void> {

    const column = vscode.window.activeTextEditor

      ? vscode.window.activeTextEditor.viewColumn

      : undefined;



    if (HttpForgePanel.currentPanel) {

      HttpForgePanel.currentPanel.panel.reveal(column);

      await HttpForgePanel.currentPanel.postInit();

      return;

    }



    const panel = vscode.window.createWebviewPanel(

      HttpForgePanel.viewType,

      APP_INFO.name,

      column ?? vscode.ViewColumn.One,

      {

        enableScripts: true,

        retainContextWhenHidden: true,

        localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'media')],

      }

    );



    HttpForgePanel.currentPanel = new HttpForgePanel(panel, extensionUri, api);

  }



  public async sendCurrentRequest(): Promise<void> {

    if (!this.state?.activeTabId) return;

    await this.executeRequest(this.state.activeTabId);

  }



  private async handleMessage(msg: WebviewToExtensionMessage): Promise<void> {

    switch (msg.type) {

      case 'ready':

        await this.postInit();

        break;

      case 'saveState':

        this.state = msg.state;

        await this.api.saveUiFromState(msg.state);

        break;

      case 'sendRequest':

        await this.executeRequest(msg.requestId);

        break;

      case 'importCollection':

        await this.handleImport(msg.format);

        break;

      case 'exportCollection':

        await this.handleExport(msg.format, msg.collectionId, msg.includeEnvironments, msg.environmentIds);

        break;

      case 'exportProject':

        await this.handleExportProject(msg.format, msg.includeEnvironments, msg.environmentIds);

        break;

      case 'loadGitStatus':

        await this.handleLoadGitStatus();

        break;

      case 'loadGitDiff':

        await this.handleLoadGitDiff(msg.filePath, msg.staged);

        break;

      case 'createProject':

        await this.handleCreateProject(msg.name, msg.description);

        break;

      case 'updateProject':

        await this.handleUpdateProject(msg.projectId, msg.name, msg.description);

        break;

      case 'deleteProject':

        await this.handleDeleteProject(msg.projectId);

        break;

      case 'switchProject':

        await this.handleSwitchProject(msg.projectId);

        break;

      case 'switchProtocol':

        await this.handleSwitchProtocol(msg.protocol);

        break;

      case 'createRequest':

        await this.handleCreateRequest(msg.collectionId, msg.protocol);

        break;

      case 'createCollection':

        await this.handleCreateCollection(msg.name, msg.protocol);

        break;

      case 'updateCollection':

        await this.handleUpdateCollection(msg.collectionId, msg.name);

        break;

      case 'deleteCollection':

        await this.handleDeleteCollection(msg.collectionId);

        break;

      case 'deleteRequest':

        await this.handleDeleteRequest(msg.requestId);

        break;

      case 'fetchWsdl':

        await this.handleFetchWsdl(msg.url, msg.requestId);

        break;

      case 'sendGraphQL':

        await this.executeGraphQL(msg.requestId, msg.query, msg.variables);

        break;

      case 'createEnvironment':

        await this.handleCreateEnvironment(msg.name, msg.color);

        break;

      case 'updateEnvironment':

        await this.handleUpdateEnvironment(msg.environmentId, msg.name, msg.color);

        break;

      case 'duplicateEnvironment':

        await this.handleDuplicateEnvironment(msg.sourceId, msg.name, msg.color);

        break;

      case 'deleteEnvironment':

        await this.handleDeleteEnvironment(msg.environmentId);

        break;

      case 'exportEnvironments':

        await this.handleExportEnvironments(msg.environmentIds);

        break;

      case 'importEnvironments':

        await this.handleImportEnvironments();

        break;

      case 'gitAction':

        await this.handleGitAction(msg.action, msg.payload, msg.environmentIds);

        break;

      case 'openExternal':
        if (msg.url) {
          await vscode.env.openExternal(vscode.Uri.parse(msg.url));
        }
        break;

      case 'notify':

        this.showNotification(msg.message, msg.level);

        break;

    }

  }



  private async executeRequest(requestId: string): Promise<void> {

    if (!this.state) {

      this.state = await this.api.buildAppState();

    }



    this.post({ type: 'sending' });



    try {

      const { state } = await this.api.executeRequest(this.state, requestId);

      this.state = state;

      this.postInit();

    } catch (err) {

      const message = err instanceof Error ? err.message : String(err);

      this.post({ type: 'error', message });

    }

  }



  private async handleImport(format: string): Promise<void> {

    try {

      const projectId = this.state?.projectId ?? this.api.getActiveProjectId();

      const result = await this.api.importCollection(projectId, format);

      if (result.canceled) return;

      await this.postInit();

      this.post({

        type: 'success',

        message: `Imported ${result.collectionsCreated ?? 0} collection(s), ${result.requestsCreated ?? 0} request(s)${result.environmentsImported ? `, ${result.environmentsImported} environment(s)` : ''}`,

      });

    } catch (err) {

      this.post({ type: 'error', message: err instanceof Error ? err.message : String(err) });

    }

  }



  private getSelectedExportEnvironmentIds(override?: string[]): string[] {
    if (override?.length) return override;
    return (
      this.state?.environments
        .filter((env) => env.includeInExport !== false)
        .map((env) => env.id) ?? []
    );
  }

  private requireSelectedEnvironments(includeEnvironments: boolean, environmentIds?: string[]): string[] | null {
    if (!includeEnvironments) return [];
    const ids = this.getSelectedExportEnvironmentIds(environmentIds);
    if (ids.length === 0) {
      this.post({
        type: 'error',
        message: 'Select at least one environment on the Environments page (check the export box).',
      });
      return null;
    }
    return ids;
  }

  private async handleExport(
    format: string,
    collectionId?: string,
    includeEnvironments?: boolean,
    environmentIds?: string[]
  ): Promise<void> {

    try {

      const projectId = this.state?.projectId ?? this.api.getActiveProjectId();
      const include = includeEnvironments ?? false;
      const ids = this.requireSelectedEnvironments(include, environmentIds);
      if (ids === null) return;

      if (!collectionId?.trim()) {
        this.post({ type: 'error', message: 'Collection ID is required for collection export' });
        return;
      }

      const result = await this.api.exportCollection(projectId, format, collectionId, include, ids);

      if (result.canceled) return;

      this.post({ type: 'success', message: `Exported to ${result.filePath}` });

    } catch (err) {

      this.post({ type: 'error', message: err instanceof Error ? err.message : String(err) });

    }

  }



  private async handleExportProject(format: string, includeEnvironments?: boolean, environmentIds?: string[]): Promise<void> {

    try {

      const projectId = this.state?.projectId ?? this.api.getActiveProjectId();
      const include = includeEnvironments ?? true;
      const ids = this.requireSelectedEnvironments(include, environmentIds);
      if (ids === null) return;

      const result = await this.api.exportProject(projectId, format, {
        includeEnvironments: include,
        environmentIds: ids,
      });

      if (result.canceled) return;

      this.post({ type: 'success', message: `Exported to ${result.filePath}` });

    } catch (err) {

      this.post({ type: 'error', message: err instanceof Error ? err.message : String(err) });

    }

  }



  private async handleLoadGitStatus(): Promise<void> {

    try {

      const projectId = this.state?.projectId ?? this.api.getActiveProjectId();

      const status = await this.api.getGitStatus(projectId);

      this.post({ type: 'gitStatus', status });

    } catch (err) {

      this.post({ type: 'error', message: err instanceof Error ? err.message : String(err) });

    }

  }



  private async handleLoadGitDiff(filePath: string, staged?: boolean): Promise<void> {

    try {

      const projectId = this.state?.projectId ?? this.api.getActiveProjectId();

      const diff = await this.api.getGitDiff(projectId, filePath, staged ?? false);

      this.post({ type: 'gitDiff', filePath, staged: staged ?? false, diff });

    } catch (err) {

      this.post({ type: 'error', message: err instanceof Error ? err.message : String(err) });

    }

  }



  private async handleCreateProject(name: string, description?: string): Promise<void> {

    try {

      this.api.createProject(name, description);

      await this.postInit();

      if (this.state) {

        this.state.sidebarNav = 'workspace';

        await this.api.saveUiFromState(this.state);

        this.postInit();

      }

      this.post({ type: 'success', message: `Project "${name}" created` });

    } catch (err) {

      this.post({ type: 'error', message: err instanceof Error ? err.message : String(err) });

    }

  }



  private async handleUpdateProject(projectId: string, name: string, description?: string): Promise<void> {

    try {

      this.api.updateProject(projectId, { name, description });

      await this.postInit();

      this.post({ type: 'success', message: 'Project updated' });

    } catch (err) {

      this.post({ type: 'error', message: err instanceof Error ? err.message : String(err) });

    }

  }



  private async handleDeleteProject(projectId: string): Promise<void> {

    try {

      this.api.deleteProject(projectId);

      await this.postInit();

      this.post({ type: 'success', message: 'Project deleted', state: this.state ?? undefined });

    } catch (err) {

      this.post({ type: 'error', message: err instanceof Error ? err.message : String(err) });

    }

  }



  private async handleSwitchProject(projectId: string): Promise<void> {

    try {

      this.api.switchProject(projectId);

      await this.postInit();

      if (this.state) {

        this.state.sidebarNav = 'workspace';

        this.state.openTabs = [];

        this.state.activeTabId = '';

        await this.api.saveUiFromState(this.state);

        this.postInit();

      }

    } catch (err) {

      this.post({ type: 'error', message: err instanceof Error ? err.message : String(err) });

    }

  }



  private async handleSwitchProtocol(protocol: string): Promise<void> {

    try {

      const projectId = this.state?.projectId ?? this.api.getActiveProjectId();

      const normalizedProtocol = normalizeProtocol(protocol) as import('./domain').Protocol;

      this.api.ensureProtocolCollection(projectId, normalizedProtocol);

      await this.postInit();

      if (!this.state) return;

      this.state.activeProtocol = normalizedProtocol;

      this.state.sidebarNav = 'workspace';

      this.state.openTabs = [];

      this.state.activeTabId = '';

      this.state.lastResponse = undefined;

      this.state.searchQuery = '';

      const protocolFolders = this.state.folders.filter(

        (f) => normalizeProtocol(f.protocol ?? 'http') === normalizedProtocol

      );

      for (const folder of protocolFolders) {

        folder.expanded = true;

        if (!this.state.expandedFolders.includes(folder.id)) {

          this.state.expandedFolders.push(folder.id);

        }

      }

      const firstRequest = protocolFolders.flatMap((f) => f.requests)[0];

      if (firstRequest) {

        this.state.openTabs = [firstRequest.id];

        this.state.activeTabId = firstRequest.id;

      }

      await this.api.saveUiFromState(this.state);

      this.postInit();

    } catch (err) {

      this.post({ type: 'error', message: err instanceof Error ? err.message : String(err) });

    }

  }



  private async handleCreateRequest(collectionId?: string, protocol?: string): Promise<void> {

    try {

      const projectId = this.state?.projectId ?? this.api.getActiveProjectId();
      const normalizedProtocol = (protocol ?? this.state?.activeProtocol ?? 'http') as import('./domain').Protocol;

      let targetCollectionId = collectionId;
      if (!targetCollectionId) {
        const col = this.api.ensureProtocolCollection(projectId, normalizedProtocol);
        targetCollectionId = col.id;
      }

      const req = this.api.createRequestInCollection(
        projectId,
        targetCollectionId,
        normalizedProtocol
      );

      await this.postInit();

      if (this.state) {

        this.state.activeTabId = req.id;
        this.state.activeProtocol = normalizedProtocol;
        this.state.sidebarNav = 'workspace';
        this.state.openTabs = [...new Set([...this.state.openTabs, req.id])];

        await this.api.saveUiFromState(this.state);

        this.postInit();

      }

    } catch (err) {

      this.post({ type: 'error', message: err instanceof Error ? err.message : String(err) });

    }

  }



  private async executeGraphQL(requestId: string, query: string, variables: string): Promise<void> {

    if (!this.state) {

      this.state = await this.api.buildAppState();

    }

    this.post({ type: 'sending' });

    try {

      const { state } = await this.api.executeGraphQL(this.state, requestId, query, variables);

      this.state = state;

      this.postInit();

    } catch (err) {

      const message = err instanceof Error ? err.message : String(err);

      this.post({ type: 'error', message });

    }

  }



  private async handleUpdateCollection(collectionId: string, name: string): Promise<void> {

    try {

      const projectId = this.state?.projectId ?? this.api.getActiveProjectId();

      this.api.updateCollection(projectId, collectionId, { name });

      await this.postInit();

      this.post({ type: 'success', message: 'Collection updated' });

    } catch (err) {

      this.post({ type: 'error', message: err instanceof Error ? err.message : String(err) });

    }

  }



  private async handleDeleteCollection(collectionId: string): Promise<void> {

    try {

      const projectId = this.state?.projectId ?? this.api.getActiveProjectId();

      this.api.deleteCollection(projectId, collectionId);

      if (this.state) {

        const removedIds = new Set(

          this.state.folders.find((f) => f.id === collectionId)?.requests.map((r) => r.id) ?? []

        );

        this.state.folders = this.state.folders.filter((f) => f.id !== collectionId);

        this.state.openTabs = this.state.openTabs.filter((id) => !removedIds.has(id));

        if (removedIds.has(this.state.activeTabId)) {

          this.state.activeTabId = this.state.openTabs[0] ?? '';

        }

        await this.api.saveUiFromState(this.state);

      }

      await this.postInit();

      this.post({ type: 'success', message: 'Collection deleted', state: this.state ?? undefined });

    } catch (err) {

      await this.postInit();

      this.post({ type: 'error', message: err instanceof Error ? err.message : String(err) });

    }

  }



  private async handleDeleteRequest(requestId: string): Promise<void> {

    try {

      const projectId = this.state?.projectId ?? this.api.getActiveProjectId();

      this.api.deleteRequest(projectId, requestId);

      if (this.state) {

        for (const folder of this.state.folders) {

          folder.requests = folder.requests.filter((r) => r.id !== requestId);

        }

        this.state.openTabs = this.state.openTabs.filter((id) => id !== requestId);

        if (this.state.activeTabId === requestId) {

          this.state.activeTabId = this.state.openTabs[0] ?? '';

        }

        await this.api.saveUiFromState(this.state);

      }

      await this.postInit();

      this.post({ type: 'success', message: 'Request deleted', state: this.state ?? undefined });

    } catch (err) {

      await this.postInit();

      this.post({ type: 'error', message: err instanceof Error ? err.message : String(err) });

    }

  }



  private async handleFetchWsdl(url: string, requestId: string): Promise<void> {

    try {

      const result = await this.api.fetchWsdl(url);

      this.post({
        type: 'wsdlParsed',
        requestId,
        targetNamespace: result.targetNamespace,
        serviceUrl: result.serviceUrl,
        operations: result.operations,
      });

    } catch (err) {

      this.post({ type: 'wsdlError', message: err instanceof Error ? err.message : String(err), requestId });

    }

  }



  private async handleCreateCollection(name: string, protocol?: string): Promise<void> {

    try {

      const projectId = this.state?.projectId ?? this.api.getActiveProjectId();

      this.api.createCollection(projectId, name, protocol ?? 'http');

      await this.postInit();

      this.post({ type: 'success', message: `Collection "${name}" created` });

    } catch (err) {

      this.post({ type: 'error', message: err instanceof Error ? err.message : String(err) });

    }

  }



  private async handleCreateEnvironment(name: string, color: string): Promise<void> {

    try {

      const projectId = this.state?.projectId ?? this.api.getActiveProjectId();

      await this.api.createEnvironmentInProject(projectId, name, color);

      await this.postInit();

      this.post({ type: 'success', message: `Environment "${name}" created` });

    } catch (err) {

      this.post({ type: 'error', message: err instanceof Error ? err.message : String(err) });

    }

  }



  private async handleUpdateEnvironment(environmentId: string, name: string, color: string): Promise<void> {

    try {

      const projectId = this.state?.projectId ?? this.api.getActiveProjectId();

      await this.api.updateEnvironmentInProject(projectId, environmentId, { name, color });

      await this.postInit();

      this.post({ type: 'success', message: 'Environment updated' });

    } catch (err) {

      this.post({ type: 'error', message: err instanceof Error ? err.message : String(err) });

    }

  }



  private async handleDuplicateEnvironment(sourceId: string, name: string, color?: string): Promise<void> {

    try {

      const projectId = this.state?.projectId ?? this.api.getActiveProjectId();

      await this.api.duplicateEnvironmentInProject(projectId, sourceId, name, color);

      await this.postInit();

      this.post({ type: 'success', message: `Environment "${name}" duplicated` });

    } catch (err) {

      this.post({ type: 'error', message: err instanceof Error ? err.message : String(err) });

    }

  }



  private async handleDeleteEnvironment(environmentId: string): Promise<void> {

    try {

      const projectId = this.state?.projectId ?? this.api.getActiveProjectId();

      await this.api.deleteEnvironmentInProject(projectId, environmentId);

      await this.postInit();

      this.post({ type: 'success', message: 'Environment deleted', state: this.state ?? undefined });

    } catch (err) {

      this.post({ type: 'error', message: err instanceof Error ? err.message : String(err) });

    }

  }



  private async handleExportEnvironments(environmentIds?: string[]): Promise<void> {

    try {

      const projectId = this.state?.projectId ?? this.api.getActiveProjectId();
      const ids = this.getSelectedExportEnvironmentIds(environmentIds);
      if (ids.length === 0) {
        this.post({
          type: 'error',
          message: 'Select at least one environment on the Environments page (check the export box).',
        });
        return;
      }

      const result = await this.api.exportEnvironments(projectId, ids);

      if (result.canceled) return;

      this.post({ type: 'success', message: `Exported to ${result.filePath}` });

    } catch (err) {

      this.post({ type: 'error', message: err instanceof Error ? err.message : String(err) });

    }

  }



  private async handleImportEnvironments(): Promise<void> {

    try {

      const projectId = this.state?.projectId ?? this.api.getActiveProjectId();

      const result = await this.api.importEnvironments(projectId);

      if (result.canceled) return;

      await this.postInit();

      this.post({ type: 'success', message: `Imported ${result.imported ?? 0} environment(s)` });

    } catch (err) {

      this.post({ type: 'error', message: err instanceof Error ? err.message : String(err) });

    }

  }



  private async handleGitAction(
    action: string,
    payload?: Record<string, string>,
    environmentIds?: string[]
  ): Promise<void> {

    const projectId = this.state?.projectId ?? this.api.getActiveProjectId();
    const docActions = new Set(['publishDocs', 'previewDocs', 'sync']);
    const ids = docActions.has(action) ? this.getSelectedExportEnvironmentIds(environmentIds) : environmentIds;
    if (docActions.has(action) && (!ids || ids.length === 0)) {
      this.post({
        type: 'error',
        message: 'Select at least one environment on the Environments page (check the export box).',
      });
      return;
    }

    try {

      switch (action) {

        case 'init':

          await this.api.initGitRepo(projectId);

          break;

        case 'chooseRepo':

          await this.api.chooseGitRepo(projectId);

          break;

        case 'setRemote':

          await this.api.setGitRemote(projectId, payload?.url ?? '');

          break;

        case 'commit':

          await this.api.gitCommit(
            projectId,
            payload?.message ?? '',
            payload?.amend === '1' || payload?.amend === 'true'
          );

          break;

        case 'stage':

          await this.api.gitStage(projectId, payload?.path ? [payload.path] : []);

          break;

        case 'unstage':

          await this.api.gitUnstage(projectId, payload?.path ? [payload.path] : []);

          break;

        case 'stageAll':

          await this.api.gitStageAll(projectId);

          break;

        case 'unstageAll':

          await this.api.gitUnstageAll(projectId);

          break;

        case 'push':

          await this.api.gitPush(projectId);

          break;

        case 'pull':

          await this.api.gitPull(projectId);

          break;

        case 'clone':

          await this.api.gitClone(projectId, payload?.url ?? '');

          break;

        case 'importFromRepo':

          await this.api.importFromRepo(projectId);

          await this.postInit();

          break;

        case 'sync':

          await this.api.syncToGit(projectId, ids);

          await this.postInit();

          break;

        case 'publishDocs':

          await this.api.publishDocs(projectId, ids);

          break;

        case 'previewDocs':

          await this.api.previewDocs(projectId, ids);

          break;

        case 'openFolder':

          await this.api.openGitFolder(projectId);

          break;

        default:

          throw new Error(`Unknown git action: ${action}`);

      }

      await this.handleLoadGitStatus();

      this.post({ type: 'success', message: `Git: ${action} completed` });

    } catch (err) {

      this.post({ type: 'error', message: err instanceof Error ? err.message : String(err) });

    }

  }



  private showNotification(message: string, level?: 'info' | 'error' | 'success'): void {

    if (level === 'error') {

      vscode.window.showErrorMessage(message);

    } else {

      vscode.window.showInformationMessage(message);

    }

  }



  private async postInit(): Promise<void> {
    try {
      this.state = await this.api.buildAppState();
      this.post({ type: 'init', state: this.state, systemIsDark: isSystemDark(), appInfo: this.getAppInfo() });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.post({ type: 'error', message: `Failed to load ${APP_INFO.name}: ${message}` });
    }
  }

  private getAppInfo() {
    try {
      const pkgPath = join(this.extensionUri.fsPath, 'package.json');
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as { version?: string };
      return { ...APP_INFO, version: pkg.version ?? APP_INFO.version };
    } catch {
      return APP_INFO;
    }
  }



  private post(message: ExtensionToWebviewMessage): void {

    void this.panel.webview.postMessage(message);

  }



  private dispose(): void {

    HttpForgePanel.currentPanel = undefined;

    vscode.commands.executeCommand('setContext', 'httpforge.panelFocused', false);

    while (this.disposables.length) {

      this.disposables.pop()?.dispose();

    }

    this.panel.dispose();

  }

}


