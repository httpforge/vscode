import { readFileSync } from 'fs';
import { join } from 'path';
import * as vscode from 'vscode';
import { APP_INFO } from './branding';

export class HttpForgeLauncherProvider implements vscode.WebviewViewProvider {
  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly onOpen: () => void
  ) {}

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, 'media')],
    };
    const fullLogoUri = webviewView.webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'media', 'full-logo.png')
    );
    const shortcut = process.platform === 'darwin' ? '⌘⇧A' : 'Ctrl+Shift+A';
    webviewView.webview.html = this.getHtml(
      fullLogoUri.toString(),
      this.getShortcutIconInline(),
      shortcut
    );

    webviewView.webview.onDidReceiveMessage((msg: { type?: string }) => {
      if (msg.type === 'open') {
        this.onOpen();
      }
    });
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

  private getHtml(
    fullLogoUri: string,
    shortcutIconInline: string,
    shortcut: string
  ): string {
    const description = APP_INFO.openSourceTagline;
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
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
    .full-logo {
      width: 100%;
      max-width: 220px;
      height: auto;
      display: block;
      margin-bottom: 12px;
    }
    .description {
      margin: 0 0 14px;
      font-size: 0.88em;
      color: var(--vscode-descriptionForeground);
      line-height: 1.45;
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
    }
    button:hover { opacity: 0.9; }
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
  <img class="full-logo" src="${fullLogoUri}" alt="${APP_INFO.name}" />
  <p class="description">${description}</p>
  <button id="open">Open API Client</button>
  <div class="shortcut-row">
    <span class="shortcut-icon-wrap">${shortcutIconInline}</span>
    <span>Shortcut: <kbd>${shortcut}</kbd></span>
  </div>
  <script>
    const vscode = acquireVsCodeApi();
    document.getElementById('open').addEventListener('click', () => {
      vscode.postMessage({ type: 'open' });
    });
  </script>
</body>
</html>`;
  }
}
