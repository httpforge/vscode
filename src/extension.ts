import * as vscode from 'vscode';
import { UiStore } from './ui-store';
import { HttpForgeLauncherProvider } from './launcherViewProvider';
import { APP_INFO } from './branding';

type ApiServiceType = import('./api-service').ApiService;

let apiService: ApiServiceType | undefined;
let statusBarItem: vscode.StatusBarItem | undefined;
let initDone = false;

async function getApiService(context: vscode.ExtensionContext): Promise<ApiServiceType> {
  if (!apiService) {
    const { ApiService } = await import('./api-service');
    const uiStore = new UiStore(context);
    apiService = new ApiService(context, uiStore);
  }
  if (!initDone) {
    try {
      apiService.initialize();
    } catch (err) {
      console.error(`[${APP_INFO.name}] Init error:`, err);
      void vscode.window.showWarningMessage(
        `${APP_INFO.name}: Using built-in JSON storage (SQLite unavailable).`
      );
    }
    initDone = true;
  }
  return apiService;
}

async function ensurePanel(context: vscode.ExtensionContext): Promise<void> {
  const api = await getApiService(context);
  const { HttpForgePanel } = await import('./panel');
  await HttpForgePanel.createOrShow(context.extensionUri, api);
}

function showLoadError(err: unknown): void {
  const message = err instanceof Error ? err.message : String(err);
  void vscode.window.showErrorMessage(`${APP_INFO.name} failed to start: ${message}`);
}

export function activate(context: vscode.ExtensionContext): void {
  const openPanel = () => {
    void ensurePanel(context).catch(showLoadError);
  };

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      'httpforge.launcher',
      new HttpForgeLauncherProvider(context.extensionUri, openPanel)
    )
  );

  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  statusBarItem.text = APP_INFO.name;
  statusBarItem.tooltip = `Show ${APP_INFO.name} sidebar (Ctrl+Shift+A opens client)`;
  statusBarItem.command = 'httpforge.showSidebar';
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);

  context.subscriptions.push(
    vscode.commands.registerCommand('httpforge.showSidebar', () => {
      void vscode.commands.executeCommand('workbench.view.extension.httpforge-api');
    }),

    vscode.commands.registerCommand('httpforge.open', openPanel),

    vscode.commands.registerCommand('httpforge.sendRequest', () => {
      void (async () => {
        await getApiService(context);
        const { HttpForgePanel } = await import('./panel');
        if (HttpForgePanel.currentPanel) {
          await HttpForgePanel.currentPanel.sendCurrentRequest();
        } else {
          await ensurePanel(context);
        }
      })().catch(showLoadError);
    }),

    vscode.commands.registerCommand('httpforge.importCollection', async () => {
      try {
        const api = await getApiService(context);
        const format = await vscode.window.showQuickPick(
          ['postman', 'openapi', 'json', 'yaml'],
          { placeHolder: 'Select import format' }
        );
        if (!format) return;
        const result = await api.importCollection(api.getActiveProjectId(), format);
        if (result.success && !result.canceled) {
          vscode.window.showInformationMessage(
            `Imported ${result.collectionsCreated ?? 0} collection(s)`
          );
        }
      } catch (err) {
        showLoadError(err);
      }
    }),

    vscode.commands.registerCommand('httpforge.exportCollection', async () => {
      try {
        const api = await getApiService(context);
        const format = await vscode.window.showQuickPick(
          ['postman', 'openapi', 'k6', 'jmeter', 'json'],
          { placeHolder: 'Select export format' }
        );
        if (!format) return;
        const result = await api.exportCollection(api.getActiveProjectId(), format, null, true);
        if (result.success && !result.canceled) {
          vscode.window.showInformationMessage(`Exported to ${result.filePath}`);
        }
      } catch (err) {
        showLoadError(err);
      }
    }),

    vscode.commands.registerCommand('httpforge.newRequest', async () => {
      try {
        const api = await getApiService(context);
        await ensurePanel(context);
        const projectId = api.getActiveProjectId();
        const collections = api.listCollections(projectId);
        if (collections.length === 0) {
          vscode.window.showWarningMessage('Create a collection first.');
          return;
        }
        const pick =
          collections.length === 1
            ? collections[0]
            : (
                await vscode.window.showQuickPick(
                  collections.map((c) => ({ label: c.name, collection: c })),
                  { placeHolder: 'Select collection' }
                )
              )?.collection;
        if (!pick) return;
        const req = api.createRequestInCollection(
          projectId,
          pick.id,
          pick.protocol as import('./domain').Protocol
        );
        vscode.window.showInformationMessage(`Created request "${req.name}"`);
      } catch (err) {
        showLoadError(err);
      }
    }),

    vscode.commands.registerCommand('httpforge.newCollection', async () => {
      try {
        const api = await getApiService(context);
        const name = await vscode.window.showInputBox({
          prompt: 'Collection name',
          placeHolder: 'HTTP Collection',
          value: 'HTTP Collection',
        });
        if (!name?.trim()) return;
        api.createCollection(api.getActiveProjectId(), name.trim(), 'http');
        vscode.window.showInformationMessage(`Collection "${name}" created`);
      } catch (err) {
        showLoadError(err);
      }
    }),

    vscode.commands.registerCommand('httpforge.gitSync', async () => {
      try {
        const api = await getApiService(context);
        await ensurePanel(context);
        const projectId = api.getActiveProjectId();
        let status = await api.getGitStatus(projectId);
        if (!status.isRepo) {
          status = await api.initGitRepo(projectId);
        }
        const result = await api.syncToGit(projectId);
        vscode.window.showInformationMessage(
          `Synced ${result.collectionCount} collection(s), ${result.requestCount} request(s) to Git`
        );
      } catch (err) {
        showLoadError(err);
      }
    }),

    vscode.commands.registerCommand('httpforge.publishDocs', async () => {
      try {
        const api = await getApiService(context);
        await ensurePanel(context);
        const projectId = api.getActiveProjectId();
        const result = await api.publishDocs(projectId);
        vscode.window.showInformationMessage(
          `Published ${result.endpointCount} endpoint(s) to ${result.htmlPath}`
        );
      } catch (err) {
        showLoadError(err);
      }
    }),

    {
      dispose: () => {
        apiService?.dispose();
        apiService = undefined;
        statusBarItem = undefined;
        initDone = false;
      },
    }
  );
}

export function deactivate(): void {
  apiService?.dispose();
  apiService = undefined;
  statusBarItem = undefined;
  initDone = false;
}
