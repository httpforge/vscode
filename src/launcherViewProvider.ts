import { readFileSync } from 'fs';
import { join } from 'path';
import * as vscode from 'vscode';
import { APP_INFO } from './branding';

type ApiServiceType = import('./api-service').ApiService;

interface LauncherProject {
  id: string;
  name: string;
  description: string;
  collectionCount: number;
  requestCount: number;
  isActive: boolean;
}

interface LauncherMessage {
  type?: string;
  projectId?: string;
}

const ICON_EDIT = `<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M11.13 1.87a1.5 1.5 0 0 1 2.12 2.12l-8.5 8.5-2.5.75.75-2.5 8.5-8.5zM10.5 2.5l1 1M2.5 13.5l.75-2.5"/></svg>`;
const ICON_DELETE = `<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M5 2h6l1 1h3v1H1V3h3l1-1zm1 4h1v7H6V6zm3 0h1v7H9V6zM3 6h1v7h8V6h1l-1 9H4L3 6z"/></svg>`;

export class HttpForgeLauncherProvider implements vscode.WebviewViewProvider {
  private view?: vscode.WebviewView;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly getApi: () => Promise<ApiServiceType>,
    private readonly onOpenProject: (projectId?: string) => Promise<void>,
    private readonly onProjectChanged?: () => Promise<void>
  ) {}

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.view = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, 'media')],
    };

    webviewView.onDidChangeVisibility(() => {
      if (webviewView.visible) {
        void this.refresh();
      }
    });

    webviewView.webview.onDidReceiveMessage((msg: LauncherMessage) => {
      void this.handleMessage(msg);
    });

    void this.refresh();
  }

  async refresh(): Promise<void> {
    if (!this.view) return;

    const api = await this.getApi();
    const projects = api.listProjects().map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description ?? '',
      collectionCount: p.collectionCount ?? 0,
      requestCount: p.requestCount ?? 0,
      isActive: p.id === api.getActiveProjectId(),
    }));

    const shortcut = process.platform === 'darwin' ? '⌘⇧A' : 'Ctrl+Shift+A';

    this.view.webview.html = this.getHtml(
      this.getShortcutIconInline(),
      shortcut,
      projects
    );
  }

  private async handleMessage(msg: LauncherMessage): Promise<void> {
    if (msg.type === 'createProject') {
      const name = await vscode.window.showInputBox({
        prompt: 'Project name',
        placeHolder: 'My API Project',
        validateInput: (value) => (value?.trim() ? null : 'Project name is required'),
      });
      if (!name?.trim()) return;

      try {
        const api = await this.getApi();
        api.createProject(name.trim());
        await this.onOpenProject();
        await this.refresh();
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        void vscode.window.showErrorMessage(message);
      }
      return;
    }

    if (msg.type === 'editProject' && msg.projectId) {
      try {
        const api = await this.getApi();
        const project = api.listProjects().find((p) => p.id === msg.projectId);
        if (!project) return;

        const name = await vscode.window.showInputBox({
          prompt: 'Project name',
          value: project.name,
          validateInput: (value) => (value?.trim() ? null : 'Project name is required'),
        });
        if (!name?.trim() || name.trim() === project.name) return;

        api.updateProject(msg.projectId, { name: name.trim() });
        await this.onProjectChanged?.();
        await this.refresh();
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        void vscode.window.showErrorMessage(message);
      }
      return;
    }

    if (msg.type === 'deleteProject' && msg.projectId) {
      try {
        const api = await this.getApi();
        const project = api.listProjects().find((p) => p.id === msg.projectId);
        if (!project) return;

        const confirm = await vscode.window.showWarningMessage(
          `Delete project "${project.name}"? All collections, requests, and environments will be removed.`,
          { modal: true },
          'Delete'
        );
        if (confirm !== 'Delete') return;

        api.deleteProject(msg.projectId);
        await this.onProjectChanged?.();
        await this.refresh();
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        void vscode.window.showErrorMessage(message);
      }
      return;
    }

    if (msg.type === 'openProject' && msg.projectId) {
      try {
        await this.onOpenProject(msg.projectId);
        await this.refresh();
      } catch (err) {
        showLoadError(err);
      }
      return;
    }

    if (msg.type === 'open') {
      try {
        const api = await this.getApi();
        const projects = api.listProjects();
        if (projects.length === 0) {
          await this.handleMessage({ type: 'createProject' });
          return;
        }
        await this.onOpenProject(api.getActiveProjectId() || projects[0]?.id);
        await this.refresh();
      } catch (err) {
        showLoadError(err);
      }
    }
  }

  private getShortcutIconInline(): string {
    try {
      const iconPath = join(this.extensionUri.fsPath, 'media', 'shortcut-icon.svg');
      return readFileSync(iconPath, 'utf8').trim();
    } catch {
      const fallbackPath = join(this.extensionUri.fsPath, 'media', 'icon.svg');
      let svg = readFileSync(fallbackPath, 'utf8');
      svg = svg
        .replace(/width="512" height="512"\s*/i, '')
        .replace(/stroke="#6B7280"/g, 'stroke="currentColor"')
        .replace(/fill="#6B7280"/g, 'fill="currentColor"')
        .replace(
          /<svg[^>]*>/,
          '<svg class="shortcut-icon" viewBox="0 0 128 128" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">'
        );
      return svg.trim();
    }
  }

  private renderProjects(projects: LauncherProject[]): string {
    const createBtn = '<button id="create" type="button" class="create-btn">+ New Project</button>';

    if (projects.length === 0) {
      return createBtn;
    }

    const items = projects
      .map(
        (p) => `
      <div class="project-item${p.isActive ? ' is-active' : ''}" data-project-id="${escapeHtml(p.id)}">
        <button type="button" class="project-open" data-project-id="${escapeHtml(p.id)}" title="${escapeHtml(p.description || p.name)}">
          <span class="project-name">${escapeHtml(p.name)}</span>
          <span class="project-meta">${p.collectionCount} collections · ${p.requestCount} requests</span>
        </button>
        <div class="project-actions">
          <button type="button" class="project-action edit" data-project-id="${escapeHtml(p.id)}" title="Rename project">${ICON_EDIT}</button>
          <button type="button" class="project-action delete" data-project-id="${escapeHtml(p.id)}" title="Delete project">${ICON_DELETE}</button>
        </div>
      </div>`
      )
      .join('');

    return `
      ${createBtn}
      <div class="project-list">
        <div class="project-list-title">Projects</div>
        ${items}
      </div>`;
  }

  private getHtml(
    shortcutIconInline: string,
    shortcut: string,
    projects: LauncherProject[]
  ): string {
    const projectsHtml = this.renderProjects(projects);

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${this.view?.webview.cspSource ?? ''} https:; style-src 'unsafe-inline'; script-src 'unsafe-inline';" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>
    html {
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      font-weight: var(--vscode-font-weight);
    }
    body {
      font-family: inherit;
      font-size: inherit;
      font-weight: inherit;
      color: var(--vscode-foreground);
      background: var(--vscode-sideBar-background);
      margin: 0;
      padding: 16px;
      box-sizing: border-box;
    }
    .create-btn {
      margin-bottom: 12px;
    }
    button {
      width: 100%;
      padding: 8px 12px;
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-family: inherit;
      font-size: inherit;
      text-align: center;
    }
    button:hover { opacity: 0.9; }
    .project-list {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .project-list-title {
      font-size: 0.78em;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: var(--vscode-descriptionForeground);
      margin-bottom: 4px;
    }
    .project-item {
      display: flex;
      flex-direction: row;
      align-items: center;
      gap: 2px;
      padding: 0;
      background: var(--vscode-editor-background);
      border: 1px solid var(--vscode-widget-border, transparent);
      border-radius: 4px;
      overflow: hidden;
    }
    .project-item:hover {
      background: var(--vscode-list-hoverBackground);
    }
    .project-item.is-active {
      border-color: var(--vscode-focusBorder);
      background: var(--vscode-list-activeSelectionBackground);
      color: var(--vscode-list-activeSelectionForeground);
    }
    .project-item.is-active .project-meta {
      color: var(--vscode-list-activeSelectionForeground);
      opacity: 0.85;
    }
    .project-item.is-active .project-action {
      color: var(--vscode-list-activeSelectionForeground, #ffffff);
      opacity: 0.9;
    }
    .project-item.is-active .project-action:hover {
      opacity: 1;
      background: rgba(255, 255, 255, 0.12);
    }
    .project-item.is-active .project-action.delete:hover {
      color: #ffb4a8;
    }
    .project-open {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 2px;
      padding: 8px 10px;
      background: transparent;
      color: inherit;
      border: none;
      border-radius: 0;
      width: auto;
      text-align: left;
      cursor: pointer;
    }
    .project-open:hover {
      opacity: 1;
    }
    .project-actions {
      display: flex;
      flex-shrink: 0;
      align-items: center;
      gap: 2px;
      padding-right: 4px;
    }
    .project-action {
      width: auto;
      padding: 4px 5px;
      background: transparent;
      color: var(--vscode-icon-foreground, var(--vscode-foreground));
      border: none;
      border-radius: 3px;
      cursor: pointer;
      line-height: 0;
      opacity: 0.65;
    }
    .project-action:hover {
      opacity: 1;
      background: var(--vscode-toolbar-hoverBackground, rgba(255,255,255,0.08));
    }
    .project-action.delete:hover {
      color: var(--vscode-errorForeground, #f48771);
    }
    .project-name {
      font-weight: 600;
      font-size: 0.95em;
      line-height: 1.3;
      word-break: break-word;
    }
    .project-meta {
      font-size: 0.78em;
      color: var(--vscode-descriptionForeground);
      line-height: 1.3;
    }
    .shortcut-row {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-top: 12px;
      color: var(--vscode-descriptionForeground);
      font-size: 0.85em;
    }
    .shortcut-icon-wrap {
      width: 22px;
      height: 22px;
      flex-shrink: 0;
      color: var(--vscode-foreground);
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .shortcut-icon-wrap svg,
    .shortcut-icon-wrap img {
      display: block;
      width: 22px;
      height: 22px;
    }
    kbd {
      padding: 1px 5px;
      border-radius: 3px;
      background: var(--vscode-editor-inactiveSelectionBackground);
      font-family: inherit;
      font-size: inherit;
    }
  </style>
</head>
<body>
  ${projectsHtml}
  <div class="shortcut-row">
    <span class="shortcut-icon-wrap">${shortcutIconInline}</span>
    <span>Shortcut: <kbd>${shortcut}</kbd></span>
  </div>
  <script>
    const vscode = acquireVsCodeApi();
    const createBtn = document.getElementById('create');
    if (createBtn) {
      createBtn.addEventListener('click', () => {
        vscode.postMessage({ type: 'createProject' });
      });
    }
    document.querySelectorAll('.project-open[data-project-id]').forEach((el) => {
      el.addEventListener('click', () => {
        vscode.postMessage({ type: 'openProject', projectId: el.getAttribute('data-project-id') });
      });
    });
    document.querySelectorAll('.project-action.edit[data-project-id]').forEach((el) => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        vscode.postMessage({ type: 'editProject', projectId: el.getAttribute('data-project-id') });
      });
    });
    document.querySelectorAll('.project-action.delete[data-project-id]').forEach((el) => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        vscode.postMessage({ type: 'deleteProject', projectId: el.getAttribute('data-project-id') });
      });
    });
    document.querySelectorAll('.project-name').forEach((el) => {
      el.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        const row = el.closest('.project-item');
        const projectId = row?.getAttribute('data-project-id');
        if (projectId) {
          vscode.postMessage({ type: 'editProject', projectId });
        }
      });
    });
  </script>
</body>
</html>`;
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function showLoadError(err: unknown): void {
  const message = err instanceof Error ? err.message : String(err);
  void vscode.window.showErrorMessage(`${APP_INFO.name} failed to start: ${message}`);
}
