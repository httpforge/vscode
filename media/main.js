// @ts-check
(function () {
  const vscode = acquireVsCodeApi();

  /** @type {any} */
  let state = null;
  /** @type {any} */
  let appInfo = {
    name: 'HttpForge',
    version: '0.1.17',
    tagline: 'Open Source IDE for Exploring and Testing APIs',
    openSourceTagline: 'Privacy-First API Development and Testing Platform',
    description: 'HttpForge is an open-source VS Code extension for API development and testing.',
    platform: 'VS Code Extension · Open Source',
    publisher: 'httpforge',
    author: 'HttpForge',
    license: 'MIT License',
    copyright: 'Copyright (c) 2026 HttpForge',
    website: 'https://httpforge.com',
    email: 'httpforge@outlook.com',
    docs: 'https://github.com/httpforge/vscode/blob/main/README.md',
    github: 'https://github.com/httpforge/vscode',
    docLinks: {
      releaseNotes: 'https://github.com/httpforge/vscode/blob/main/CHANGELOG.md',
      learningCenter: 'https://github.com/httpforge/vscode/blob/main/README.md',
      support: 'https://github.com/httpforge/vscode/issues',
      security: 'https://github.com/httpforge/vscode/blob/main/SECURITY.md',
      privacy: 'https://github.com/httpforge/vscode/blob/main/PRIVACY.md',
      terms: 'https://github.com/httpforge/vscode/blob/main/TERMS.md',
    },
    features: [],
  };
  let sending = false;
  let envDropdownOpen = false;
  let gearDropdownOpen = false;
  let tabMenuOpen = false;
  let protocolPickerOpen = false;
  let newCollectionProtocol = 'http';
  /** @type {{ id: string; name: string }[]} */
  let recentlyClosedTabs = [];
  const RECENTLY_CLOSED_MAX = 10;
  let saveTimer = null;
  let requestDeletePending = false;
  let collectionDeletePending = false;
  let projectDeletePending = false;
  /** @type {string | null} */
  let editingRequestTitleId = null;
  /** @type {string | null} */
  let editingCollectionNameId = null;

  const RESPONSE_PANEL_DEFAULT = 384;
  const RESPONSE_PANEL_MIN = 260;
  const RESPONSE_PANEL_MAX = 900;
  /** @type {number} */
  let responsePanelWidth = RESPONSE_PANEL_DEFAULT;
  const webviewState = vscode.getState();
  if (webviewState && typeof webviewState.responsePanelWidth === 'number') {
    responsePanelWidth = Math.min(
      RESPONSE_PANEL_MAX,
      Math.max(RESPONSE_PANEL_MIN, webviewState.responsePanelWidth)
    );
  }

  const METHOD_COLORS = {
    GET: 'method-get',
    POST: 'method-post',
    PUT: 'method-put',
    DELETE: 'method-delete',
    PATCH: 'method-patch',
    HEAD: 'method-get',
    OPTIONS: 'method-get',
  };

  const VALID_PROTOCOLS = new Set([
    'http', 'graphql', 'soap', 'websocket', 'grpc', 'socketio', 'ai', 'mcp',
  ]);

  const PROTOCOLS = [
    { id: 'http', name: 'HTTP', color: '#2563EB', icon: '🌐' },
    { id: 'graphql', name: 'GraphQL', color: '#DB2777', icon: '◈' },
    { id: 'websocket', name: 'WebSocket', color: '#CA8A04', icon: '⚡' },
    { id: 'grpc', name: 'gRPC', color: '#16A34A', icon: '⬡' },
    { id: 'soap', name: 'SOAP', color: '#9333EA', icon: '📄' },
  ];

  const DEFAULT_GRAPHQL_QUERY = '# Enter your GraphQL query\nquery {\n  \n}';
  const DEFAULT_SOAP_ENVELOPE = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope
    xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
    xmlns:web="http://example.com/webservice">

   <soapenv:Header/>

   <soapenv:Body>
      <web:GetUser>
         <web:UserId>123</web:UserId>
      </web:GetUser>
   </soapenv:Body>

</soapenv:Envelope>`;
  const DEFAULT_SOAP_ACTION = 'GetUser';

  /** @type {Record<string, { url: string; targetNamespace: string; serviceUrl?: string; operations: { name: string; soapAction: string }[]; loading?: boolean; error?: string }>} */
  let wsdlCache = {};

  const EXPORT_FORMATS = [
    { id: 'postman', name: 'Postman Collection', desc: 'Import into Postman, Insomnia, or Bruno' },
    { id: 'openapi', name: 'OpenAPI / Swagger', desc: 'Standard API specification (JSON)' },
    { id: 'jmeter', name: 'Apache JMeter', desc: 'Load test plan (.jmx) with environment variables' },
    { id: 'k6', name: 'k6', desc: 'JavaScript load test script' },
    { id: 'json', name: 'HttpForge JSON', desc: 'Full backup — collections + environments' },
  ];

  const IMPORT_FORMATS = [
    { id: 'postman', name: 'Postman Collection', desc: 'Postman v2.1 JSON export' },
    { id: 'openapi', name: 'OpenAPI / Swagger', desc: 'OpenAPI 3.0 JSON spec' },
    { id: 'json', name: 'JSON', desc: 'HttpForge, Postman, or generic JSON' },
    { id: 'yaml', name: 'OpenAPI YAML', desc: 'OpenAPI / Swagger YAML spec' },
  ];

  /** @type {any} */
  let gitStatus = null;
  /** @type {any} */
  let exportModal = null;
  /** @type {any} */
  let importModal = null;
  let gitRemoteInput = '';
  let gitCommitSubject = 'Update API collections';
  let gitCommitBody = '';
  let gitAmendCommit = false;
  let gitCloneUrl = '';
  /** @type {string | null} */
  let gitSelectedFile = null;
  let gitSelectedStaged = false;
  /** @type {string} */
  let gitDiffContent = '';
  let gitShowSetup = false;
  /** @type {'path' | 'status'} */
  let gitFileSort = 'path';
  /** @type {'log' | 'search' | 'status'} */
  let gitBottomTab = 'log';
  let gitLogSearch = '';
  /** @type {string | null} */
  let gitSelectedCommitHash = null;
  let gitSideBySideDiff = true;
  /** @type {'all' | 'success' | 'error'} */
  let consoleFilter = 'all';
  /** @type {string | null} */
  let expandedConsoleId = null;

  /** @type {Record<string, string[]>} */
  let wsMessages = {};
  /** @type {Record<string, WebSocket>} */
  let wsSockets = {};

  /** @type {Record<string, boolean>} */
  let kvBulkEditMode = {};
  /** @type {Record<string, string>} */
  let kvBulkEditDraft = {};

  function kvBulkKey(tableId) {
    const reqId = state?.activeTabId ?? '';
    return `${reqId}:${tableId}`;
  }

  function keyValuesToBulkText(items) {
    return items
      .filter((item) => item.key || item.value)
      .map((item) => {
        const prefix = item.enabled === false ? '// ' : '';
        return `${prefix}${item.key}:${item.value}`;
      })
      .join('\n');
  }

  function parseBulkTextToKeyValues(text) {
    const lines = String(text ?? '').split(/\r?\n/);
    const rows = [];
    for (const line of lines) {
      if (!line.trim()) continue;
      let enabled = true;
      let content = line;
      if (/^\s*\/\//.test(line)) {
        enabled = false;
        content = line.replace(/^\s*\/\/\s?/, '');
      }
      const colonIdx = content.indexOf(':');
      let key;
      let value;
      if (colonIdx === -1) {
        key = content.trim();
        value = '';
      } else {
        key = content.slice(0, colonIdx).trim();
        value = content.slice(colonIdx + 1);
      }
      if (!key && !value) continue;
      rows.push({ id: uid(), key, value, enabled, description: '' });
    }
    return rows.length > 0 ? rows : [{ id: uid(), key: '', value: '', enabled: true, description: '' }];
  }

  function applyBulkEditToRequest(req, tableId, text) {
    const rows = parseBulkTextToKeyValues(text);
    if (tableId === 'params') {
      req.params = rows;
      ensureRequestConfig(req).params = rows;
    } else if (tableId === 'headers') {
      req.headers = rows;
      ensureRequestConfig(req).headers = rows;
    } else if (tableId === 'cookies') {
      ensureRequestConfig(req).cookies = rows;
    }
  }

  function commitBulkEditForTable(tableId, close = true) {
    const req = getActiveRequest();
    if (!req) return;
    const bulkKey = kvBulkKey(tableId);
    if (!kvBulkEditMode[bulkKey]) return;
    applyBulkEditToRequest(req, tableId, kvBulkEditDraft[bulkKey] ?? keyValuesToBulkText(getRequestKeyValues(req, tableId)));
    if (close) {
      kvBulkEditMode[bulkKey] = false;
      delete kvBulkEditDraft[bulkKey];
    }
  }

  function renderKeyValuePanel(req, tableId, title, subtitle) {
    const bulkKey = kvBulkKey(tableId);
    const bulk = !!kvBulkEditMode[bulkKey];
    const items = getRequestKeyValues(req, tableId);
    const toolbar = `
      <div class="flex items-center justify-between mb-3 gap-2">
        <span class="text-sm font-medium text-gray-700 dark:text-gray-300">${escapeHtml(title)}</span>
        <button data-action="${bulk ? 'kv-key-value-edit' : 'kv-bulk-edit'}" data-table="${tableId}" class="text-xs text-blue-600 hover:text-blue-800 shrink-0">${bulk ? 'Key-Value Edit' : 'Bulk Edit'}</button>
      </div>`;

    if (bulk) {
      const draft = kvBulkEditDraft[bulkKey] ?? keyValuesToBulkText(items);
      return `
        <div class="p-4 flex-1 overflow-y-auto flex flex-col min-h-0">
          ${toolbar}
          <textarea data-action="kv-bulk-input" data-table="${tableId}" class="flex-1 w-full min-h-[240px] p-4 text-sm font-mono bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-500" spellcheck="false">${escapeHtml(draft)}</textarea>
          <p class="text-xs text-gray-400 mt-2 leading-relaxed">Rows are separated by new lines<br/>Keys and values are separated by :<br/>Prepend // to any row you want to add but keep disabled</p>
        </div>`;
    }

    return `
      <div class="p-4 flex-1 overflow-y-auto">
        ${toolbar}
        ${subtitle ? `<p class="text-xs text-gray-400 mb-2">${subtitle}</p>` : ''}
        <table class="w-full text-sm">
          <thead><tr class="border-b text-xs text-gray-400"><th class="w-8 px-3 py-2"></th><th class="text-left px-2 py-2">Key</th><th class="text-left px-2 py-2">Value</th><th class="w-8"></th></tr></thead>
          <tbody>${renderKeyValueTable(items, tableId)}</tbody>
        </table>
      </div>`;
  }

  function renderGearMenu() {
    const version = appInfo.version ?? '0.0.0';
    const github = appInfo.github || 'https://github.com/httpforge/vscode';
    const blob = (path) => `${github.replace(/\/$/, '')}/blob/main/${path}`;
    const links = appInfo.docLinks ?? {};
    const items = [
      { id: 'learning-center', label: 'Learning Center', href: links.learningCenter ?? blob('README.md') },
      { id: 'support', label: 'Support Center', href: links.support ?? `${github}/issues` },
      { id: 'security', label: 'Security', href: links.security ?? blob('SECURITY.md') },
      { id: 'privacy', label: 'Privacy Policy', href: links.privacy ?? blob('PRIVACY.md') },
      { id: 'terms', label: 'Terms', href: links.terms ?? blob('TERMS.md') },
    ];
    const rows = items
      .map(
        (item) =>
          `<button type="button" data-action="gear-menu" data-gear="${item.id}" data-href="${escapeHtml(item.href)}" class="gear-menu-item">${escapeHtml(item.label)}</button>`
      )
      .join('');
    const releaseNotesHref = links.releaseNotes ?? blob('CHANGELOG.md');
    return `
      <button type="button" data-action="gear-menu" data-gear="settings" class="gear-menu-head">Settings</button>
      <button type="button" data-action="gear-menu" data-gear="release-notes" data-href="${escapeHtml(releaseNotesHref)}" class="gear-menu-highlight">Version ${escapeHtml(version)} — view release notes</button>
      ${rows}`;
  }

  function normalizeProtocol(p) {
    const value = typeof p === 'string' ? p.toLowerCase() : '';
    return value && VALID_PROTOCOLS.has(value) ? value : 'http';
  }

  function protocolLabel(id) {
    return PROTOCOLS.find((p) => p.id === id)?.name ?? id;
  }

  function getProtocolMeta(id) {
    const normalized = normalizeProtocol(id);
    return PROTOCOLS.find((p) => p.id === normalized) ?? PROTOCOLS[0];
  }

  function protocolIcon(id, className = 'header-protocol-icon') {
    const meta = getProtocolMeta(id);
    return renderProtocolIconSvg(meta.id, meta.color, className);
  }

  function getRequestProtocol(req) {
    if (!req) return 'http';
    if (req.protocol) return normalizeProtocol(req.protocol);
    const folder = state.folders.find((f) => f.requests.some((r) => r.id === req.id));
    return normalizeProtocol(folder?.protocol);
  }

  function foldersForProtocol(protocol) {
    const p = normalizeProtocol(protocol);
    return state.folders
      .filter((f) => normalizeProtocol(f.protocol) === p)
      .map((folder) => ({
        ...folder,
        requests: folder.requests.filter((r) => getRequestProtocol(r) === p),
      }));
  }

  function switchToProtocol(protocol) {
    const p = normalizeProtocol(protocol);
    if (!state || p === normalizeProtocol(state.activeProtocol)) return;
    editingRequestTitleId = null;
    editingCollectionNameId = null;
    sending = false;
    state.activeProtocol = p;
    state.openTabs = [];
    state.activeTabId = '';
    state.lastResponse = null;
    state.searchQuery = '';
    if (p === 'soap') {
      state.activeSoapTab = state.activeSoapTab || 'envelope';
      state.activeResponseTab = 'xml';
    } else if (p === 'graphql') {
      state.activeGraphqlTab = state.activeGraphqlTab || 'query';
      state.activeResponseTab = state.activeResponseTab || 'json';
    } else {
      state.activeResponseTab = state.activeResponseTab || 'json';
    }
    const folders = foldersForProtocol(p);
    for (const folder of folders) {
      folder.expanded = true;
      if (!state.expandedFolders.includes(folder.id)) {
        state.expandedFolders.push(folder.id);
      }
    }
    const firstReq = folders.flatMap((f) => f.requests)[0];
    if (firstReq) {
      state.openTabs = [firstReq.id];
      state.activeTabId = firstReq.id;
    }
    render();
    vscode.postMessage({ type: 'switchProtocol', protocol: p });
  }

  function defaultUrlForProtocol(protocol) {
    switch (protocol) {
      case 'graphql':
        return '{{BASE_URL}}/graphql';
      case 'websocket':
        return '{{BASE_URL}}/ws';
      case 'soap':
        return '{{BASE_URL}}/soap';
      case 'grpc':
        return '{{BASE_URL}}/grpc';
      default:
        return '{{BASE_URL}}/';
    }
  }

  function defaultNameForProtocol(protocol) {
    switch (normalizeProtocol(protocol)) {
      case 'graphql':
        return 'Untitled Query';
      case 'soap':
        return 'Untitled SOAP Request';
      case 'websocket':
        return 'Untitled WebSocket';
      case 'grpc':
        return 'Untitled gRPC Call';
      default:
        return 'Untitled Request';
    }
  }

  function renderProtocolIconSvg(id, color, className = 'header-protocol-icon') {
    const c = color;
    switch (id) {
      case 'http':
        return `<svg class="${className}" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6.25" fill="none" stroke="${c}" stroke-width="1.25"/><ellipse cx="8" cy="8" rx="2.75" ry="6.25" fill="none" stroke="${c}" stroke-width="1.1"/><path d="M2.2 6h11.6M2.2 10h11.6" fill="none" stroke="${c}" stroke-width="1.1" stroke-linecap="round"/></svg>`;
      case 'graphql':
        return `<svg class="${className}" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.5 12.8 4.25v5.5L8 12.5 3.2 9.75v-5.5L8 1.5z" fill="none" stroke="${c}" stroke-width="1.15" stroke-linejoin="round"/><circle cx="8" cy="4.4" r="1.05" fill="${c}"/><circle cx="5.35" cy="9.1" r="1.05" fill="${c}"/><circle cx="10.65" cy="9.1" r="1.05" fill="${c}"/></svg>`;
      case 'websocket':
        return `<svg class="${className}" viewBox="0 0 16 16" aria-hidden="true"><path d="M9.2 1.8 4.6 8.4h2.9L6.8 14.2 11.4 7.6H8.5L9.2 1.8z" fill="${c}"/></svg>`;
      case 'grpc':
        return `<svg class="${className}" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 2.2 12.6 4.9v5.2L8 12.8 3.4 10.1V4.9L8 2.2z" fill="${c}" opacity="0.95"/><path d="M8 4.6 10.8 6.2v3.6L8 11.4 5.2 9.8V6.2L8 4.6z" fill="#fff" opacity="0.92"/></svg>`;
      case 'soap':
        return `<svg class="${className}" viewBox="0 0 16 16" aria-hidden="true"><path d="M4.5 2.8h7a1.2 1.2 0 0 1 1.2 1.2v8a1.2 1.2 0 0 1-1.2 1.2h-7a1.2 1.2 0 0 1-1.2-1.2v-8a1.2 1.2 0 0 1 1.2-1.2z" fill="none" stroke="${c}" stroke-width="1.15"/><path d="M5.6 5.4h4.8M5.6 8h4.8M5.6 10.6h3.1" fill="none" stroke="${c}" stroke-width="1.1" stroke-linecap="round"/></svg>`;
      default:
        return `<svg class="${className}" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="4" fill="${c}"/></svg>`;
    }
  }

  function renderProtocolPicker() {
    const selected = getProtocolMeta(newCollectionProtocol);
    const options = PROTOCOLS.map((p) => {
      const isActive = p.id === selected.id;
      return `<button type="button" data-action="pick-collection-protocol" data-protocol="${p.id}" class="protocol-picker-option${isActive ? ' is-active' : ''}">${renderProtocolIconSvg(p.id, p.color)}<span>${p.name}</span></button>`;
    }).join('');
    return `
      <div class="protocol-picker relative">
        <button type="button" data-action="toggle-protocol-picker" class="protocol-picker-trigger" style="--protocol-color:${selected.color}" aria-expanded="${protocolPickerOpen}" aria-haspopup="listbox">
          ${renderProtocolIconSvg(selected.id, selected.color)}
          <span class="protocol-picker-label">${selected.name}</span>
          <svg class="protocol-picker-chevron" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
        <div class="dropdown-menu protocol-picker-menu ${protocolPickerOpen ? 'open' : ''}" role="listbox">${options}</div>
      </div>`;
  }

  function renderProjectName() {
    const projectName = (state.projectName || '').trim() || t('settings.project');
    return `<span class="header-project-name" title="${escapeHtml(projectName)}">${escapeHtml(projectName)}</span>`;
  }

  function renderProtocolTabs() {
    const active = normalizeProtocol(state.activeProtocol);
    const tabs = PROTOCOLS.map((p, index) => {
      const isActive = active === p.id;
      const divider = index > 0 ? '<span class="header-protocol-divider" aria-hidden="true"></span>' : '';
      return `${divider}<button type="button" data-action="set-protocol" data-protocol="${p.id}" class="header-protocol-tab${isActive ? ' is-active' : ''}" style="--protocol-color:${p.color}" aria-current="${isActive ? 'page' : 'false'}">${renderProtocolIconSvg(p.id, p.color)}<span class="header-protocol-label">${p.name}</span></button>`;
    }).join('');
    return `<div class="header-protocol-bar"><div class="header-protocol-tabs">${tabs}</div></div>`;
  }

  function explorerMethodLabel(r) {
    const rp = getRequestProtocol(r);
    if (rp === 'graphql') return 'GQL';
    if (rp === 'soap') return 'SOAP';
    if (rp === 'websocket') return 'WS';
    if (rp === 'grpc') return 'RPC';
    if (r.method === 'DELETE') return 'DEL';
    return r.method;
  }

  function renderBuilderTitleInput(_req) {
    return '';
  }

  function renderBuilderProtocolChip(req) {
    return '';
  }

  /** @type {boolean} */
  let systemIsDark = false;

  /** @param {string} key @param {Record<string, string | number>=} [vars] */
  function t(key, vars) {
    const lang = state?.language || 'en';
    return window.HTTPFORGE_I18N?.translate(lang, key, vars) ?? key;
  }

  function applyLanguage() {
    const lang = state?.language || 'en';
    const rtl = window.HTTPFORGE_I18N?.rtlLocales?.includes(lang);
    document.documentElement.lang = lang;
    document.documentElement.dir = rtl ? 'rtl' : 'ltr';
  }

  /** @returns {boolean} */
  function isDarkMode() {
    if (!state) return systemIsDark;
    if (state.themeMode === 'dark') return true;
    if (state.themeMode === 'light') return false;
    return systemIsDark;
  }

  /** @returns {string} */
  function themeIcon() {
    if (!state) return '💻';
    if (state.themeMode === 'system') return '💻';
    if (state.themeMode === 'dark') return '🌙';
    return '☀️';
  }

  /** @returns {string} */
  function themeLabel() {
    if (!state) return t('theme.system');
    if (state.themeMode === 'system') return t('theme.system');
    if (state.themeMode === 'dark') return t('theme.dark');
    return t('theme.light');
  }

  function applyThemeClass() {
    if (isDarkMode()) {
      document.documentElement.classList.add('dark');
      document.documentElement.dataset.theme = 'dark';
      document.documentElement.style.colorScheme = 'dark';
    } else {
      document.documentElement.classList.remove('dark');
      document.documentElement.dataset.theme = 'light';
      document.documentElement.style.colorScheme = 'light';
    }
    applyLanguage();
  }

  function cycleThemeMode() {
    const order = ['system', 'light', 'dark'];
    const idx = order.indexOf(state.themeMode || 'system');
    state.themeMode = order[(idx + 1) % order.length];
    persistState();
    applyThemeClass();
    render();
  }

  function persistResponsePanelWidth() {
    const prev = vscode.getState() || {};
    vscode.setState({ ...prev, responsePanelWidth });
  }

  function startResponsePanelResize(e) {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = responsePanelWidth;
    const resizer = /** @type {HTMLElement | null} */ (document.querySelector('[data-resizer="response"]'));
    if (resizer) resizer.classList.add('active');
    document.body.classList.add('panel-resizing');

    function onMove(ev) {
      const delta = startX - ev.clientX;
      responsePanelWidth = Math.min(
        RESPONSE_PANEL_MAX,
        Math.max(RESPONSE_PANEL_MIN, startWidth + delta)
      );
      const panel = document.getElementById('response-panel');
      if (panel) panel.style.width = `${responsePanelWidth}px`;
    }

    function onUp() {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.classList.remove('panel-resizing');
      if (resizer) resizer.classList.remove('active');
      persistResponsePanelWidth();
    }

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  function persistState() {
    if (requestDeletePending || collectionDeletePending || projectDeletePending) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(flushPersistState, 300);
  }

  function flushPersistState() {
    if (requestDeletePending || collectionDeletePending || projectDeletePending) return;
    clearTimeout(saveTimer);
    saveTimer = null;
    if (!state) return;
    commitBulkEditForTable('params', false);
    commitBulkEditForTable('headers', false);
    for (const folder of state.folders ?? []) {
      for (const req of folder.requests) {
        syncRequestConfigFromLegacy(req);
      }
    }
    vscode.postMessage({ type: 'saveState', state });
  }

  function commitNewEnvVarFromInputs(envId, options = {}) {
    const { clearInputs = false, renderAfter = false, notifyDuplicate = false } = options;
    const env = state?.environments.find((e) => e.id === envId);
    if (!env) return false;
    const keyInput = document.querySelector(`[data-action="new-env-var-key"][data-env-id="${envId}"]`);
    const valueInput = document.querySelector(`[data-action="new-env-var-value"][data-env-id="${envId}"]`);
    const rawKey = keyInput?.value?.trim() ?? '';
    if (!rawKey) return false;
    const check = validateEnvVarName(rawKey);
    if (!check.valid) {
      vscode.postMessage({ type: 'notify', message: check.error, level: 'error' });
      return false;
    }
    if (Object.prototype.hasOwnProperty.call(env.variables, check.normalized)) {
      if (notifyDuplicate) {
        vscode.postMessage({ type: 'notify', message: `Variable "${check.normalized}" already exists`, level: 'error' });
      }
      return false;
    }
    env.variables[check.normalized] = valueInput?.value ?? '';
    if (clearInputs) {
      if (keyInput) keyInput.value = '';
      if (valueInput) valueInput.value = '';
    }
    flushPersistState();
    if (renderAfter) render();
    return true;
  }

  function ensureRequestConfig(req) {
    if (!req.requestConfig) {
      req.requestConfig = {
        params: ensureKeyValueArray(req.params),
        headers: ensureKeyValueArray(req.headers),
        bodyType: req.bodyType || 'none',
        body: req.body || '',
        preRequestScript: '',
        testScript: '',
        cookies: [],
        settings: { followRedirects: true, validateSsl: true, timeoutMs: 0 },
      };
    }
    const config = req.requestConfig;
    if (!config.preRequestScript) config.preRequestScript = '';
    if (!config.testScript) config.testScript = '';
    if (!Array.isArray(config.cookies)) config.cookies = [];
    if (!config.settings) config.settings = { followRedirects: true, validateSsl: true, timeoutMs: 0 };
    if (config.soapAction === undefined) config.soapAction = '';
    if (!config.soapContentType) config.soapContentType = 'text/xml';
    return config;
  }

  function initSoapRequest(req) {
    const config = ensureRequestConfig(req);
    req.method = 'POST';
    req.bodyType = 'xml';
    if (!req.body?.trim()) {
      req.body = DEFAULT_SOAP_ENVELOPE;
    }
    config.bodyType = 'xml';
    config.body = req.body;
    if (!config.soapAction?.trim()) {
      config.soapAction = detectSoapActionFromEnvelope(req.body) || DEFAULT_SOAP_ACTION;
    }
    if (!config.soapContentType) config.soapContentType = 'text/xml';
  }

  function detectSoapActionFromEnvelope(xml) {
    const match = xml.match(/<(?:[\w]+:)?Body[^>]*>\s*<(?:[\w]+:)?(\w+)/i);
    return match?.[1] ?? '';
  }

  function prettyPrintXml(xml) {
    try {
      const formatted = xml.replace(/>\s*</g, '>\n<');
      let pad = 0;
      return formatted
        .split('\n')
        .map((line) => {
          const trimmed = line.trim();
          if (!trimmed) return '';
          if (/^<\/.+>/.test(trimmed)) pad = Math.max(0, pad - 1);
          const indented = `${'  '.repeat(pad)}${trimmed}`;
          if (/^<[^!?/][^>]*[^/]>$/.test(trimmed)) pad += 1;
          return indented;
        })
        .filter(Boolean)
        .join('\n');
    } catch {
      return xml;
    }
  }

  function formatXml(xml) {
    try {
      const doc = new DOMParser().parseFromString(xml, 'application/xml');
      if (doc.querySelector('parsererror')) return prettyPrintXml(xml);
      return prettyPrintXml(new XMLSerializer().serializeToString(doc));
    } catch {
      return prettyPrintXml(xml);
    }
  }

  function isXmlContent(body, headers) {
    const ct = headers?.['content-type'] ?? headers?.['Content-Type'] ?? '';
    if (ct.includes('xml')) return true;
    const trimmed = (body ?? '').trim();
    return trimmed.startsWith('<?xml') || trimmed.startsWith('<soap') || trimmed.startsWith('<SOAP');
  }

  function highlightXml(xml) {
    const escaped = escapeHtml(xml);
    return escaped
      .replace(/(&lt;\/?)([\w:-]+)(.*?&gt;)/g, '<span class="xml-tag">$1$2$3</span>')
      .replace(/(&lt;!--[\s\S]*?--&gt;)/g, '<span class="xml-comment">$1</span>');
  }

  function renderXmlTreeNode(node, depth = 0) {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent?.trim();
      if (!text) return '';
      return `<li class="xml-tree-text" style="padding-left:${depth * 12}px">${escapeHtml(text)}</li>`;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return '';
    const el = /** @type {Element} */ (node);
    const attrs = [...el.attributes]
      .map((a) => `<span class="xml-attr"> ${escapeHtml(a.name)}="${escapeHtml(a.value)}"</span>`)
      .join('');
    const children = [...el.childNodes]
      .map((child) => renderXmlTreeNode(child, depth + 1))
      .filter(Boolean)
      .join('');
    const open = `<li style="padding-left:${depth * 12}px"><span class="xml-tag">&lt;${escapeHtml(el.tagName)}${attrs}&gt;</span>`;
    if (!children) {
      return `${open}<span class="xml-tag">&lt;/${escapeHtml(el.tagName)}&gt;</span></li>`;
    }
    return `${open}<ul class="xml-tree-children">${children}</ul><span class="xml-tag" style="padding-left:${depth * 12}px">&lt;/${escapeHtml(el.tagName)}&gt;</span></li>`;
  }

  function renderXmlTree(xml) {
    try {
      const doc = new DOMParser().parseFromString(xml, 'application/xml');
      if (doc.querySelector('parsererror')) {
        return `<pre class="response-raw-view">${escapeHtml(xml)}</pre>`;
      }
      return `<ul class="xml-tree">${renderXmlTreeNode(doc.documentElement)}</ul>`;
    } catch {
      return `<pre class="response-raw-view">${escapeHtml(xml)}</pre>`;
    }
  }

  function buildSoapEnvelopeForOperation(operationName, targetNamespace) {
    return `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope
    xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
    xmlns:web="${targetNamespace}">

   <soapenv:Header/>

   <soapenv:Body>
      <web:${operationName}>
         <!-- Add request parameters here -->
      </web:${operationName}>
   </soapenv:Body>

</soapenv:Envelope>`;
  }

  function syncSoapConfig(req) {
    const config = ensureRequestConfig(req);
    config.body = req.body ?? '';
    config.bodyType = 'xml';
    req.bodyType = 'xml';
    if (!config.soapAction?.trim()) {
      config.soapAction = detectSoapActionFromEnvelope(config.body) || DEFAULT_SOAP_ACTION;
    }
  }

  function syncRequestConfigFromLegacy(req) {
    const config = ensureRequestConfig(req);
    config.params = ensureKeyValueArray(req.params);
    config.headers = ensureKeyValueArray(req.headers);
    config.body = req.body ?? '';
    config.bodyType = req.bodyType || config.bodyType || 'none';
    config.auth = { ...ensureRequestAuth(req) };
    req.requestConfig = config;
  }

  function prepareStateForSend() {
    if (!state) return;
    commitBulkEditForTable('params', false);
    commitBulkEditForTable('headers', false);
    for (const folder of state.folders ?? []) {
      for (const req of folder.requests) {
        syncRequestConfigFromLegacy(req);
      }
    }
  }

  function getActiveRequest() {
    if (!state) return null;
    for (const folder of state.folders) {
      const req = folder.requests.find((r) => r.id === state.activeTabId);
      if (req) return req;
    }
    return null;
  }

  function getActiveEnv() {
    if (!state?.environments?.length) return null;
    const active = state.environments.find((e) => e.id === state.activeEnvironmentId);
    return active ?? state.environments[0] ?? null;
  }

  function listUnresolvedEnvVars(text) {
    const env = getActiveEnv();
    const names = [];
    const re = /\{\{([^}]+)\}\}/g;
    let match;
    while ((match = re.exec(text ?? '')) !== null) {
      names.push(match[1].trim());
    }
    return names.filter((name) => !env?.variables?.[name]?.trim());
  }

  function isEnvIncludedInExport(env) {
    return env?.includeInExport !== false;
  }

  function getSelectedExportEnvironmentIds() {
    return (state?.environments ?? []).filter(isEnvIncludedInExport).map((e) => e.id);
  }

  /** @type {{ open: boolean; input: HTMLInputElement | HTMLTextAreaElement | null; start: number; cursor: number; query: string; highlight: number }} */
  let envVarPicker = { open: false, input: null, start: 0, cursor: 0, query: '', highlight: 0 };

  function getEnvVarTrigger(value, cursor) {
    const before = value.slice(0, cursor);
    const match = before.match(/\{\{([^}]*)$/);
    if (!match) return null;
    return { start: cursor - match[1].length - 2, query: match[1] };
  }

  function getEnvVarSuggestions(query, envId) {
    const env = envId
      ? state?.environments.find((e) => e.id === envId)
      : getActiveEnv();
    const keys = env ? Object.keys(env.variables || {}) : [];
    keys.sort((a, b) => {
      if (a === 'BASE_URL') return -1;
      if (b === 'BASE_URL') return 1;
      return a.localeCompare(b);
    });
    const q = (query || '').toLowerCase();
    return keys
      .filter((k) => k.toLowerCase().includes(q))
      .map((k) => ({
        key: k,
        value: env.variables[k] ?? '',
        secret: /token|key|secret|password/i.test(k),
      }));
  }

  function ensureEnvVarPickerEl() {
    let el = document.getElementById('env-var-picker');
    if (!el) {
      el = document.createElement('div');
      el.id = 'env-var-picker';
      el.className = 'env-var-picker hidden';
      document.body.appendChild(el);
    }
    return el;
  }

  function hideEnvVarPicker() {
    envVarPicker.open = false;
    envVarPicker.input = null;
    const el = document.getElementById('env-var-picker');
    if (el) el.classList.add('hidden');
  }

  function applyAutocompleteInputValue(input, value) {
    const req = getActiveRequest();
    const action = input.dataset.action;
    let changed = false;
    if (action === 'set-url' && req) {
      req.url = value;
      changed = true;
    } else if (action === 'set-auth-token' && req) {
      req.authToken = value;
      changed = true;
    } else if (action === 'set-body' && req) {
      req.body = value;
      changed = true;
    } else if (action === 'set-graphql-query' && req) {
      req.graphqlQuery = value;
      changed = true;
    } else if (action === 'set-graphql-variables' && req) {
      req.graphqlVariables = value;
      changed = true;
    } else if (action === 'edit-kv' && req) {
      const arr = getRequestKeyValues(req, input.dataset.table);
      arr[parseInt(input.dataset.index, 10)][input.dataset.field] = value;
      changed = true;
    } else if (action === 'set-env-var') {
      const env = state?.environments.find((e) => e.id === input.dataset.envId);
      if (env) {
        env.variables[input.dataset.varKey] = value;
        changed = true;
      }
    }
    if (changed) persistState();
  }

  function insertEnvVar(key) {
    const input = envVarPicker.input;
    if (!input) return;
    const value = input.value;
    const cursor = envVarPicker.cursor;
    const before = value.slice(0, envVarPicker.start);
    const after = value.slice(cursor);
    const insertion = `{{${key}}}`;
    const next = before + insertion + after;
    const nextCursor = before.length + insertion.length;
    input.value = next;
    applyAutocompleteInputValue(input, next);
    hideEnvVarPicker();
    input.focus();
    input.setSelectionRange(nextCursor, nextCursor);
  }

  function renderEnvVarPicker(input, suggestions) {
    const picker = ensureEnvVarPickerEl();
    const envId = input.dataset.envId || null;
    const env = envId ? state?.environments.find((e) => e.id === envId) : getActiveEnv();
    const totalKeys = env ? Object.keys(env.variables || {}).length : 0;
    if (!suggestions.length) {
      const emptyMsg =
        totalKeys === 0 ? 'No variables in this environment' : 'No matching variables';
      picker.innerHTML = `<div class="env-var-picker-head">Environment variables</div><div class="env-var-picker-empty">${emptyMsg}</div>`;
    } else {
      picker.innerHTML =
        `<div class="env-var-picker-head">Environment variables</div>` +
        suggestions
          .map(
            (v, i) =>
              `<button type="button" class="env-var-picker-item${i === envVarPicker.highlight ? ' active' : ''}" data-env-var-key="${escapeHtml(v.key)}">
                <span class="env-var-picker-key">{{${escapeHtml(v.key)}}}</span>
                <span class="env-var-picker-val">${v.secret ? '••••••' : escapeHtml(v.value || 'empty')}</span>
              </button>`
          )
          .join('');
      picker.querySelectorAll('[data-env-var-key]').forEach((btn) => {
        btn.addEventListener('mousedown', (e) => {
          e.preventDefault();
          insertEnvVar(btn.getAttribute('data-env-var-key'));
        });
      });
    }
    const rect = input.getBoundingClientRect();
    picker.style.top = `${rect.bottom + 4}px`;
    picker.style.left = `${rect.left}px`;
    picker.style.minWidth = `${Math.max(rect.width, 220)}px`;
    picker.classList.remove('hidden');
  }

  function updateEnvVarPicker(input) {
    const cursor = input.selectionStart ?? input.value.length;
    const trigger = getEnvVarTrigger(input.value, cursor);
    if (!trigger) {
      hideEnvVarPicker();
      return;
    }
    const envId = input.dataset.envId || null;
    const suggestions = getEnvVarSuggestions(trigger.query, envId);
    envVarPicker = { open: true, input, start: trigger.start, cursor, query: trigger.query, highlight: 0 };
    renderEnvVarPicker(input, suggestions);
  }

  function handleEnvVarPickerKeydown(e) {
    if (!envVarPicker.open || !envVarPicker.input) return false;
    const envId = envVarPicker.input.dataset.envId || null;
    const suggestions = getEnvVarSuggestions(envVarPicker.query, envId);
    if (!suggestions.length) {
      if (e.key === 'Escape') hideEnvVarPicker();
      return e.key === 'Escape';
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      envVarPicker.highlight = (envVarPicker.highlight + 1) % suggestions.length;
      renderEnvVarPicker(envVarPicker.input, suggestions);
      return true;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      envVarPicker.highlight = (envVarPicker.highlight - 1 + suggestions.length) % suggestions.length;
      renderEnvVarPicker(envVarPicker.input, suggestions);
      return true;
    }
    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      insertEnvVar(suggestions[envVarPicker.highlight].key);
      return true;
    }
    if (e.key === 'Escape') {
      hideEnvVarPicker();
      return true;
    }
    return false;
  }

  function formatBytes(n) {
    if (n < 1024) return n + ' B';
    return (n / 1024).toFixed(2) + ' KB';
  }

  function timeAgo(ts) {
    const s = Math.floor((Date.now() - ts) / 1000);
    if (s < 60) return 'just now';
    if (s < 3600) return Math.floor(s / 60) + 'm ago';
    if (s < 86400) return Math.floor(s / 3600) + 'h ago';
    return Math.floor(s / 86400) + 'd ago';
  }

  function statusClass(code) {
    if (code >= 200 && code < 300) return 'status-2xx';
    if (code >= 300 && code < 400) return 'status-3xx';
    if (code >= 400 && code < 500) return 'status-4xx';
    return 'status-5xx';
  }

  function highlightJson(json) {
    try {
      const obj = typeof json === 'string' ? JSON.parse(json) : json;
      const formatted = JSON.stringify(obj, null, 2);
      return formatted
        .split('\n')
        .map((line, i) => {
          const num = String(i + 1).padStart(2, ' ');
          const highlighted = line
            .replace(/"([^"]+)":/g, '<span class="json-key">"$1"</span>:')
            .replace(/: "([^"]*)"/g, ': <span class="json-string">"$1"</span>')
            .replace(/: (\d+\.?\d*)/g, ': <span class="json-number">$1</span>')
            .replace(/: (true|false)/g, ': <span class="json-bool">$1</span>')
            .replace(/: (null)/g, ': <span class="json-null">$1</span>');
          return `<span class="response-line-num">${num}</span>${highlighted}`;
        })
        .join('\n');
    } catch {
      return escapeHtml(json);
    }
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  const ICON_PATHS = {
    edit: [
      '<path d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z"/>',
      '<path d="M19.5 7.125L16.862 4.487"/>',
    ],
    view: [
      '<path d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z"/>',
      '<path d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>',
    ],
    delete: [
      '<path d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"/>',
    ],
    export: '<path d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3"/>',
    duplicate: '<path d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 01-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 011.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25a9.06 9.06 0 00-1.5-.124M18.375 7.5H15a2.25 2.25 0 00-2.25 2.25v9.375"/>',
    copy: '<path d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.083.394.083.6v.675M15.666 3.888c-.082.03-.168.056-.254.082M15.666 3.888l-3.182 3.182M4.5 20.25h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v11.25A2.25 2.25 0 004.5 20.25z"/>',
    plus: '<path d="M12 4.5v15m7.5-7.5h-15"/>',
  };

  function iconSvg(name) {
    const paths = ICON_PATHS[name];
    if (!paths) return '';
    const body = Array.isArray(paths) ? paths.join('') : paths;
    return `<svg class="icon-action-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
  }

  function iconActionBtn(dataAttrs, icon, title, extraClass = '') {
    const danger = icon === 'delete' || extraClass.includes('danger');
    return `<button type="button" ${dataAttrs} class="icon-action-btn${danger ? ' danger' : ''} ${extraClass}" title="${escapeHtml(title)}" aria-label="${escapeHtml(title)}">${iconSvg(icon)}</button>`;
  }

  function iconActionGroup(innerHtml) {
    return `<div class="icon-action-group shrink-0">${innerHtml}</div>`;
  }

  const AUTH_TYPES = [
    { value: 'none', label: 'No Auth' },
    { value: 'apikey', label: 'API Key' },
    { value: 'bearer', label: 'Bearer Token' },
    { value: 'jwt-bearer', label: 'JWT Bearer' },
    { value: 'basic', label: 'Basic Auth' },
    { value: 'digest', label: 'Digest Auth' },
    { value: 'oauth1', label: 'OAuth 1.0' },
    { value: 'oauth2', label: 'OAuth 2.0' },
    { value: 'hawk', label: 'Hawk Authentication' },
    { value: 'aws', label: 'AWS Signature' },
    { value: 'ntlm', label: 'NTLM Authentication [Beta]' },
    { value: 'akamai', label: 'Akamai EdgeGrid' },
  ];

  const DEFAULT_AUTH = {
    type: 'none',
    bearerToken: '{{ACCESS_TOKEN}}',
    apiKeyName: 'X-API-Key',
    apiKeyValue: '{{API_KEY}}',
    apiKeyIn: 'header',
    basicUsername: '',
    basicPassword: '',
    oauthToken: '{{ACCESS_TOKEN}}',
  };

  function configAuthTypeToLegacy(type) {
    if (type === 'api-key') return 'apikey';
    return type || 'none';
  }

  function legacyAuthTypeToConfig(type) {
    if (type === 'apikey') return 'api-key';
    return type || 'none';
  }

  function ensureRequestAuth(req) {
    const config = ensureRequestConfig(req);
    if (!config.auth) {
      config.auth = { ...DEFAULT_AUTH, type: legacyAuthTypeToConfig(req.authType || 'none') };
    }
    if (!req.authType) {
      req.authType = configAuthTypeToLegacy(config.auth.type);
    }
    return config.auth;
  }

  function renderAuthInput(label, action, value, placeholder = '', type = 'text') {
    return `
      <div>
        <label class="block text-xs font-medium text-gray-500 mb-1.5">${escapeHtml(label)}</label>
        <input data-action="${action}" data-env-autocomplete="1" type="${type}" value="${escapeHtml(value ?? '')}" placeholder="${escapeHtml(placeholder)}" class="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 dark:bg-gray-800 rounded-lg font-mono" />
      </div>`;
  }

  function renderAuthPanel(req) {
    const auth = ensureRequestAuth(req);
    const type = req.authType || configAuthTypeToLegacy(auth.type);
    const options = AUTH_TYPES.map(
      (item) => `<option value="${item.value}" ${type === item.value ? 'selected' : ''}>${escapeHtml(item.label)}</option>`
    ).join('');

    let fields = '';
    switch (type) {
      case 'none':
        fields = '<p class="text-sm text-gray-500">This request does not use any authorization.</p>';
        break;
      case 'apikey':
        fields = `
          ${renderAuthInput('Key', 'set-auth-api-key-name', auth.apiKeyName, 'X-API-Key')}
          ${renderAuthInput('Value', 'set-auth-api-key-value', auth.apiKeyValue, '{{API_KEY}}')}
          <div>
            <label class="block text-xs font-medium text-gray-500 mb-1.5">Add to</label>
            <select data-action="set-auth-api-key-in" class="w-full max-w-xs px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 dark:bg-gray-800 rounded-lg">
              <option value="header" ${auth.apiKeyIn !== 'query' ? 'selected' : ''}>Header</option>
              <option value="query" ${auth.apiKeyIn === 'query' ? 'selected' : ''}>Query Params</option>
            </select>
          </div>
          <p class="text-xs text-gray-400">The key and value will be sent as a header or query parameter when you send the request.</p>`;
        break;
      case 'bearer':
        fields = `
          ${renderAuthInput('Token', 'set-auth-bearer-token', auth.bearerToken, '{{ACCESS_TOKEN}}')}
          <p class="text-xs text-gray-400">The Authorization header will be automatically generated when you send the request.</p>`;
        break;
      case 'jwt-bearer':
        fields = `
          ${renderAuthInput('JWT Token', 'set-auth-bearer-token', auth.bearerToken, '{{ACCESS_TOKEN}}')}
          <p class="text-xs text-gray-400">The JWT will be sent as a Bearer token in the Authorization header.</p>`;
        break;
      case 'basic':
        fields = `
          ${renderAuthInput('Username', 'set-auth-basic-user', auth.basicUsername)}
          ${renderAuthInput('Password', 'set-auth-basic-pass', auth.basicPassword, '', 'password')}
          <p class="text-xs text-gray-400">Credentials are sent as a Base64-encoded Authorization header.</p>`;
        break;
      case 'digest':
        fields = `
          ${renderAuthInput('Username', 'set-auth-basic-user', auth.basicUsername)}
          ${renderAuthInput('Password', 'set-auth-basic-pass', auth.basicPassword, '', 'password')}
          <p class="text-xs text-gray-400">Digest Auth configuration is saved with this request. Full Digest handshake support is coming soon.</p>`;
        break;
      case 'oauth1':
        fields = `
          ${renderAuthInput('Consumer Key', 'set-auth-basic-user', auth.basicUsername)}
          ${renderAuthInput('Consumer Secret', 'set-auth-basic-pass', auth.basicPassword, '', 'password')}
          ${renderAuthInput('Access Token', 'set-auth-bearer-token', auth.bearerToken)}
          <p class="text-xs text-gray-400">OAuth 1.0 signing is coming soon. Values are saved with this request.</p>`;
        break;
      case 'oauth2':
        fields = `
          ${renderAuthInput('Access Token', 'set-auth-oauth-token', auth.oauthToken, '{{ACCESS_TOKEN}}')}
          <p class="text-xs text-gray-400">The token will be sent as a Bearer token in the Authorization header.</p>`;
        break;
      case 'hawk':
        fields = `
          ${renderAuthInput('Hawk Auth ID', 'set-auth-basic-user', auth.basicUsername)}
          ${renderAuthInput('Hawk Auth Key', 'set-auth-basic-pass', auth.basicPassword, '', 'password')}
          <p class="text-xs text-gray-400">Hawk Authentication is coming soon. Values are saved with this request.</p>`;
        break;
      case 'aws':
        fields = `
          ${renderAuthInput('Access Key', 'set-auth-basic-user', auth.basicUsername)}
          ${renderAuthInput('Secret Key', 'set-auth-basic-pass', auth.basicPassword, '', 'password')}
          ${renderAuthInput('AWS Region', 'set-auth-api-key-name', auth.apiKeyName, 'us-east-1')}
          ${renderAuthInput('Service Name', 'set-auth-api-key-value', auth.apiKeyValue, 'execute-api')}
          <p class="text-xs text-gray-400">AWS Signature v4 signing is coming soon. Values are saved with this request.</p>`;
        break;
      case 'ntlm':
        fields = `
          ${renderAuthInput('Username', 'set-auth-basic-user', auth.basicUsername)}
          ${renderAuthInput('Password', 'set-auth-basic-pass', auth.basicPassword, '', 'password')}
          ${renderAuthInput('Domain', 'set-auth-api-key-name', auth.apiKeyName)}
          <p class="text-xs text-gray-400">NTLM Authentication [Beta] is coming soon. Values are saved with this request.</p>`;
        break;
      case 'akamai':
        fields = `
          ${renderAuthInput('Client Token', 'set-auth-basic-user', auth.basicUsername)}
          ${renderAuthInput('Client Secret', 'set-auth-basic-pass', auth.basicPassword, '', 'password')}
          ${renderAuthInput('Access Token', 'set-auth-bearer-token', auth.bearerToken)}
          <p class="text-xs text-gray-400">Akamai EdgeGrid signing is coming soon. Values are saved with this request.</p>`;
        break;
      default:
        fields = '<p class="text-sm text-gray-500">Select an authorization type.</p>';
    }

    return `
      <div class="p-4 space-y-3 flex-1 overflow-y-auto">
        <div>
          <label class="block text-xs font-medium text-gray-500 mb-1.5">Type</label>
          <select data-action="set-auth-type" class="w-full max-w-md px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 dark:bg-gray-800 rounded-lg">${options}</select>
        </div>
        ${fields}
      </div>`;
  }

  function syncLegacyAuthToken(req) {
    const auth = ensureRequestAuth(req);
    switch (req.authType) {
      case 'bearer':
      case 'jwt-bearer':
        req.authToken = auth.bearerToken;
        break;
      case 'basic':
      case 'digest':
      case 'ntlm':
        req.authToken = auth.basicPassword;
        break;
      case 'apikey':
        req.authToken = auth.apiKeyValue;
        break;
      case 'oauth2':
        req.authToken = auth.oauthToken;
        break;
      default:
        req.authToken = req.authToken || '';
    }
  }

  function uid() {
    return Math.random().toString(36).slice(2, 10);
  }

  const ENV_VAR_NAME_PATTERN = /^[A-Z][A-Z0-9_]*$/;

  function normalizeEnvVarName(raw) {
    return String(raw ?? '')
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9_]/g, '');
  }

  function validateEnvVarName(key) {
    const normalized = normalizeEnvVarName(key);
    if (!normalized) {
      return { valid: false, normalized, error: 'Variable name is required' };
    }
    if (!ENV_VAR_NAME_PATTERN.test(normalized)) {
      return {
        valid: false,
        normalized,
        error: 'Use uppercase letters, numbers, and underscores only (e.g. BASE_URL)',
      };
    }
    return { valid: true, normalized };
  }

  function ensureKeyValueArray(items) {
    if (!Array.isArray(items)) return [{ id: uid(), key: '', value: '', enabled: true }];
    if (items.length === 0) return [{ id: uid(), key: '', value: '', enabled: true }];
    return items;
  }

  function getRequestKeyValues(req, table) {
    if (table === 'params') {
      req.params = ensureKeyValueArray(req.params);
      ensureRequestConfig(req).params = req.params;
      return req.params;
    }
    if (table === 'cookies') {
      const config = ensureRequestConfig(req);
      config.cookies = ensureKeyValueArray(config.cookies);
      return config.cookies;
    }
    req.headers = ensureKeyValueArray(req.headers);
    ensureRequestConfig(req).headers = req.headers;
    return req.headers;
  }

  function renderKeyValueTable(items, tableId) {
    const rows = items
      .map(
        (item, idx) => `
      <tr class="border-b border-gray-50 dark:border-gray-800" data-kv-index="${idx}">
        <td class="px-3 py-2"><input type="checkbox" data-action="toggle-kv" data-table="${tableId}" data-index="${idx}" ${item.enabled ? 'checked' : ''} class="rounded border-gray-300 text-blue-600" /></td>
        <td class="px-2 py-2"><input data-action="edit-kv" data-env-autocomplete="1" data-table="${tableId}" data-field="key" data-index="${idx}" value="${escapeHtml(item.key)}" class="kv-field-input" /></td>
        <td class="px-2 py-2"><input data-action="edit-kv" data-env-autocomplete="1" data-table="${tableId}" data-field="value" data-index="${idx}" value="${escapeHtml(item.value)}" class="kv-field-input" /></td>
        <td class="px-2 py-2">${iconActionBtn(`data-action="remove-kv" data-table="${tableId}" data-index="${idx}"`, 'delete', 'Remove row', 'inline danger icon-only')}</td>
      </tr>`
      )
      .join('');
    return rows + `
      <tr>
        <td colspan="4" class="px-3 py-2">
          <button data-action="add-kv" data-table="${tableId}" class="text-xs text-blue-600 hover:text-blue-800">+ Add row</button>
        </td>
      </tr>`;
  }

  function timelinePhaseMs(phase) {
    return phase.ms ?? phase.value ?? 0;
  }

  function timelinePhaseColor(phase) {
    const named = {
      green: '#22c55e',
      orange: '#f97316',
      sky: '#0ea5e9',
      purple: '#a855f7',
      red: '#ef4444',
    };
    const defaults = {
      'DNS Lookup': '#2563EB',
      'TCP Connection': '#7C3AED',
      'SSL Handshake': '#10B981',
      TTFB: '#F59E0B',
      Download: '#EF4444',
    };
    if (phase.color?.startsWith('#')) return phase.color;
    if (named[phase.color]) return named[phase.color];
    return defaults[phase.name] ?? '#94a3b8';
  }

  function formatLogTime(timestamp) {
    return new Date(timestamp).toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  }

  function getConsoleLogs() {
    const logs = state?.history ?? [];
    if (consoleFilter === 'success') {
      return logs.filter((e) => e.status >= 200 && e.status < 400);
    }
    if (consoleFilter === 'error') {
      return logs.filter((e) => e.status >= 400 || e.status === 0);
    }
    return logs;
  }

  function renderTimelineBarChart(timeline) {
    if (!timeline || timeline.length === 0) {
      return '<div class="bottom-chart-empty">Send a request</div>';
    }
    const phases = timeline
      .map((t) => ({
        name: t.name,
        ms: timelinePhaseMs(t),
        color: timelinePhaseColor(t),
      }))
      .filter((t) => t.ms > 0);
    if (phases.length === 0) {
      return '<div class="bottom-chart-empty">No timing data</div>';
    }
    const total = phases.reduce((s, t) => s + t.ms, 0) || 1;
    const bars = phases
      .map(
        (t) =>
          `<div class="h-full shrink-0" style="width:${Math.max(1, (t.ms / total) * 100)}%;background-color:${t.color}" title="${escapeHtml(t.name)}: ${t.ms}ms"></div>`
      )
      .join('');
    const legend = phases
      .map(
        (t) =>
          `<div class="bottom-chart-legend-item">
            <span class="bottom-chart-legend-swatch" style="background-color:${t.color}"></span>
            <span class="bottom-chart-legend-name">${escapeHtml(t.name)}</span>
            <span class="bottom-chart-legend-ms">${t.ms}ms</span>
          </div>`
      )
      .join('');
    return `
      <div class="bottom-chart-timeline">
        <div class="bottom-chart-bar">${bars}</div>
        <div class="bottom-chart-legend">${legend}</div>
        <div class="bottom-chart-total">Total ${total}ms</div>
      </div>`;
  }

  function renderPerformanceBarChart() {
    const recent = (state?.history ?? []).slice(0, 14).reverse();
    if (recent.length === 0) {
      return '<div class="bottom-chart-empty">No requests yet</div>';
    }
    const maxMs = Math.max(...recent.map((h) => h.durationMs), 1);
    const maxBarPx = 36;
    const bars = recent
      .map((h) => {
        const barPx = Math.max(2, Math.round((h.durationMs / maxMs) * maxBarPx));
        const ok = h.status >= 200 && h.status < 400;
        const color = ok ? '#7c3aed' : '#ef4444';
        return `
        <div class="bottom-chart-perf-bar-wrap">
          <div class="bottom-chart-perf-bar" style="height:${barPx}px;background-color:${color}" title="${h.method} ${h.status} — ${h.durationMs}ms"></div>
        </div>`;
      })
      .join('');
    return `<div class="bottom-chart-perf">${bars}</div>`;
  }

  function renderConsolePanel() {
    const logs = getConsoleLogs();
    const logRows =
      logs.length === 0
        ? `<div class="flex flex-col items-center justify-center h-full text-center px-4 py-6">
            <span class="text-lg mb-1 opacity-40">⌘</span>
            <p class="text-sm font-medium text-gray-500">No logs yet</p>
            <p class="text-xs text-gray-400 mt-1">Send a request to view details in the console</p>
          </div>`
        : logs
            .map((entry) => {
              const expanded = expandedConsoleId === entry.id;
              return `
            <div class="border-b border-gray-100 dark:border-gray-800 last:border-0">
              <button data-action="toggle-console-entry" data-log-id="${entry.id}" class="console-log-row flex items-center gap-1.5 w-full px-2 py-1 hover:bg-gray-50 dark:hover:bg-gray-800/80 text-left">
                <span class="text-gray-400 shrink-0">${expanded ? '▾' : '▸'}</span>
                <span class="console-log-time text-gray-400 font-mono shrink-0 w-[71px]">${formatLogTime(entry.timestamp)}</span>
                <span class="console-log-method shrink-0 w-7 ${METHOD_COLORS[entry.method] || ''}">${entry.method === 'DELETE' ? 'DEL' : entry.method}</span>
                <span class="console-log-url flex-1 truncate font-mono text-gray-600 dark:text-gray-400">${escapeHtml(entry.url)}</span>
                <span class="console-log-status ${statusClass(entry.status)} shrink-0 w-7 text-right">${entry.status || '—'}</span>
                <span class="console-log-duration text-gray-400 shrink-0 w-10 text-right">${entry.durationMs}ms</span>
              </button>
              ${expanded ? `<div class="console-log-detail px-2 pb-2 pl-8 space-y-1 bg-gray-50/80 dark:bg-gray-800/40">
                <pre class="font-mono p-1.5 rounded-lg bg-slate-900 text-slate-100 overflow-x-auto">${escapeHtml(`${entry.method} ${entry.url}\nStatus: ${entry.status} (${entry.durationMs}ms)`)}</pre>
              </div>` : ''}
            </div>`;
            })
            .join('');

    return `
      <div class="console-panel flex flex-col h-full min-w-0">
        <div class="flex items-center justify-between px-2 py-1 border-b border-gray-200 dark:border-gray-700 shrink-0 gap-2">
          <div class="flex items-center gap-1.5">
            <span class="console-panel-header">Console</span>
            <span class="console-panel-badge px-1 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-500">${logs.length}</span>
          </div>
          <div class="console-panel-controls flex items-center gap-1">
            <select data-action="console-filter" class="px-1.5 py-0.5 rounded border border-gray-200 dark:border-gray-600 dark:bg-gray-800 text-gray-600 dark:text-gray-300">
              <option value="all" ${consoleFilter === 'all' ? 'selected' : ''}>All</option>
              <option value="success" ${consoleFilter === 'success' ? 'selected' : ''}>Success</option>
              <option value="error" ${consoleFilter === 'error' ? 'selected' : ''}>Errors</option>
            </select>
            <button data-action="clear-console" class="px-1.5 py-0.5 rounded border border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-500" ${logs.length === 0 ? 'disabled' : ''}>Clear</button>
          </div>
        </div>
        <div class="flex-1 overflow-y-auto min-h-0">${logRows}</div>
      </div>`;
  }

  function renderTimeline(timeline) {
    if (!timeline || timeline.length === 0) {
      return '<div class="text-xs text-gray-400">Send a request to see timeline</div>';
    }
    const phases = timeline
      .map((t) => ({
        name: t.name,
        ms: timelinePhaseMs(t),
        color: timelinePhaseColor(t),
      }))
      .filter((t) => t.ms > 0);

    if (phases.length === 0) {
      return '<div class="text-xs text-gray-400">Send a request to see timeline</div>';
    }

    const total = phases.reduce((s, t) => s + t.ms, 0) || 1;
    const bars = phases
      .map(
        (t) =>
          `<div class="h-full shrink-0" style="width:${Math.max(1, (t.ms / total) * 100)}%;background-color:${t.color}" title="${escapeHtml(t.name)}: ${t.ms}ms"></div>`
      )
      .join('');
    const legend = phases
      .map(
        (t) =>
          `<span class="flex items-center gap-1"><span class="w-2 h-2 rounded-sm shrink-0" style="background-color:${t.color}"></span>${escapeHtml(t.name)} <span class="text-gray-400">${t.ms}ms</span></span>`
      )
      .join('');
    return `<div class="flex h-6 rounded overflow-hidden mb-2 bg-gray-100 dark:bg-gray-800">${bars}</div><div class="flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-gray-500">${legend}</div>`;
  }

  function renderSearchBar() {
    return `
      <div class="header-search relative shrink-0">
        <svg class="header-search-icon" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <circle cx="11" cy="11" r="8"/>
          <path d="m21 21-4.3-4.3"/>
        </svg>
        <input data-action="search" type="text" value="${escapeHtml(state.searchQuery)}" placeholder="${t('header.searchPlaceholder')}" class="header-search-input w-full pl-8 pr-3 py-1.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
      </div>`;
  }

  function tabMenuShortcut(primary, secondary) {
    const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPod|iPad/i.test(navigator.platform);
    if (isMac) {
      return secondary ? `⌥⌘${secondary}` : `⌘${primary}`;
    }
    return secondary ? `Ctrl+Alt+${secondary}` : `Ctrl+${primary}`;
  }

  function rememberClosedTab(id) {
    const req = findRequestById(id);
    if (!req) return;
    recentlyClosedTabs = [
      { id, name: req.name },
      ...recentlyClosedTabs.filter((t) => t.id !== id),
    ].slice(0, RECENTLY_CLOSED_MAX);
  }

  function cloneKeyValueRows(rows) {
    return (rows ?? []).map((row) => ({ ...row, id: uid() }));
  }

  function duplicateRequest(req) {
    const copy = JSON.parse(JSON.stringify(req));
    copy.id = `req-${Date.now().toString(36)}-${uid()}`;
    copy.name = `${req.name} (copy)`;
    copy.params = cloneKeyValueRows(copy.params);
    copy.headers = cloneKeyValueRows(copy.headers);
    if (copy.requestConfig) {
      copy.requestConfig.params = cloneKeyValueRows(copy.requestConfig.params);
      copy.requestConfig.headers = cloneKeyValueRows(copy.requestConfig.headers);
      if (copy.requestConfig.cookies) {
        copy.requestConfig.cookies = cloneKeyValueRows(copy.requestConfig.cookies);
      }
    }
    return copy;
  }

  function closeTabById(id, trackRecent = true) {
    if (!id || !state.openTabs.includes(id)) return;
    if (trackRecent) rememberClosedTab(id);
    state.openTabs = state.openTabs.filter((t) => t !== id);
    if (state.activeTabId === id) {
      state.activeTabId = state.openTabs[state.openTabs.length - 1] || '';
    }
    tabMenuOpen = false;
    persistState();
    render();
  }

  function closeActiveTab() {
    if (!state.activeTabId) return;
    closeTabById(state.activeTabId, true);
  }

  function closeAllButActiveTab() {
    if (!state.activeTabId) return;
    const keep = state.activeTabId;
    for (const id of [...state.openTabs]) {
      if (id !== keep) rememberClosedTab(id);
    }
    state.openTabs = state.openTabs.filter((id) => id === keep);
    tabMenuOpen = false;
    persistState();
    render();
  }

  function closeAllTabs() {
    for (const id of [...state.openTabs]) {
      rememberClosedTab(id);
    }
    state.openTabs = [];
    state.activeTabId = '';
    tabMenuOpen = false;
    persistState();
    render();
  }

  function duplicateActiveTab() {
    const req = getActiveRequest();
    if (!req) return;
    const folder = state.folders.find((f) => f.requests.some((r) => r.id === req.id));
    if (!folder) return;
    const copy = duplicateRequest(req);
    folder.requests.push(copy);
    if (!state.openTabs.includes(copy.id)) {
      state.openTabs.push(copy.id);
    }
    state.activeTabId = copy.id;
    tabMenuOpen = false;
    persistState();
    render();
  }

  function reopenClosedTab(id) {
    const req = findRequestById(id);
    if (!req) return;
    if (!state.openTabs.includes(id)) {
      state.openTabs.push(id);
    }
    state.activeTabId = id;
    recentlyClosedTabs = recentlyClosedTabs.filter((t) => t.id !== id);
    tabMenuOpen = false;
    persistState();
    render();
  }

  function renderTabMenu() {
    const hasRecent = recentlyClosedTabs.length > 0;
    const recentFlyout = hasRecent
      ? recentlyClosedTabs
          .map(
            (t) =>
              `<button type="button" data-action="reopen-closed-tab" data-tab-id="${escapeHtml(t.id)}" class="tab-menu-flyout-item">${escapeHtml(t.name)}</button>`
          )
          .join('')
      : `<div class="tab-menu-flyout-empty">No recently closed tabs</div>`;

    return `
      <div class="tab-menu-item-wrap${hasRecent ? '' : ' is-disabled'}">
        <button type="button" class="tab-menu-item" ${hasRecent ? '' : 'disabled'}>
          <span>Recently Closed Tabs</span>
          <span class="tab-menu-chevron" aria-hidden="true">›</span>
        </button>
        <div class="tab-menu-flyout">${recentFlyout}</div>
      </div>
      <button type="button" data-action="tab-menu" data-tab-cmd="duplicate" class="tab-menu-item"${state.activeTabId ? '' : ' disabled'}>Duplicate Selected Tab</button>
      <div class="tab-menu-separator" role="separator"></div>
      <button type="button" data-action="tab-menu" data-tab-cmd="close" class="tab-menu-item"${state.activeTabId ? '' : ' disabled'}>
        <span>Close Selected Tab</span>
        <span class="tab-menu-shortcut">${tabMenuShortcut('W')}</span>
      </button>
      <button type="button" data-action="tab-menu" data-tab-cmd="force-close" class="tab-menu-item"${state.activeTabId ? '' : ' disabled'}>
        <span>Force Close Selected Tab</span>
        <span class="tab-menu-shortcut">${tabMenuShortcut('W', 'W')}</span>
      </button>
      <button type="button" data-action="tab-menu" data-tab-cmd="close-others" class="tab-menu-item"${state.activeTabId && state.openTabs.length > 1 ? '' : ' disabled'}>Close All but Selected Tab</button>
      <button type="button" data-action="tab-menu" data-tab-cmd="close-all" class="tab-menu-item"${state.openTabs.length ? '' : ' disabled'}>Close All Tabs</button>
      <button type="button" data-action="tab-menu" data-tab-cmd="force-close-all" class="tab-menu-item"${state.openTabs.length ? '' : ' disabled'}>Force Close All Tabs</button>`;
  }

  function initGraphqlRequest(req) {
    if (!req.graphqlQuery?.trim()) {
      req.graphqlQuery = DEFAULT_GRAPHQL_QUERY;
    }
    if (!req.graphqlVariables?.trim()) {
      req.graphqlVariables = '{}';
    }
    req.method = 'POST';
  }

  function ensureActiveRequestDefaults() {
    const req = getActiveRequest();
    if (!req) return;
    if (getRequestProtocol(req) === 'graphql') {
      initGraphqlRequest(req);
    }
    if (getRequestProtocol(req) === 'soap') {
      initSoapRequest(req);
    }
  }

  function resolveEnvVarsInText(text) {
    const env = getActiveEnv();
    return String(text ?? '').replace(/\{\{([^}]+)\}\}/g, (_, name) => {
      const key = name.trim();
      return env?.variables?.[key]?.trim() ?? `{{${key}}}`;
    });
  }

  function resolveWebSocketUrl(rawUrl) {
    let url = resolveEnvVarsInText(rawUrl).trim();
    if (!url || /\{\{[^}]+\}\}/.test(url)) return url;
    if (!/^wss?:\/\//i.test(url)) {
      url = url.replace(/^https:\/\//i, 'wss://').replace(/^http:\/\//i, 'ws://');
      if (!/^wss?:\/\//i.test(url)) {
        url = `ws://${url.replace(/^\/+/, '')}`;
      }
    }
    return url;
  }

  function pushWsMessage(requestId, message) {
    if (!wsMessages[requestId]) wsMessages[requestId] = [];
    wsMessages[requestId].push(message);
  }

  function connectWebSocket(req) {
    const unresolved = listUnresolvedEnvVars(req.url);
    if (unresolved.length) {
      const env = getActiveEnv();
      const envLabel = env?.name ?? 'your environment';
      vscode.postMessage({
        type: 'notify',
        message: `Unresolved URL variable(s): ${unresolved.join(', ')}. Open Environments, select "${envLabel}", and set their values (e.g. BASE_URL = https://api.example.com).`,
        level: 'error',
      });
      return;
    }
    const url = resolveWebSocketUrl(req.url);
    if (!url) {
      vscode.postMessage({ type: 'notify', message: 'Enter a WebSocket URL.', level: 'error' });
      return;
    }
    if (wsSockets[req.id]?.readyState === WebSocket.OPEN) {
      pushWsMessage(req.id, { type: 'system', content: 'Already connected' });
      render();
      return;
    }
    if (wsSockets[req.id]) {
      try {
        wsSockets[req.id].close();
      } catch {
        /* ignore */
      }
    }
    pushWsMessage(req.id, { type: 'system', content: `Connecting to ${url}...` });
    render();
    try {
      const ws = new WebSocket(url);
      wsSockets[req.id] = ws;
      ws.onopen = () => {
        pushWsMessage(req.id, { type: 'system', content: 'Connected' });
        render();
      };
      ws.onmessage = (event) => {
        pushWsMessage(req.id, { type: 'received', content: String(event.data) });
        render();
      };
      ws.onerror = () => {
        pushWsMessage(req.id, { type: 'system', content: 'Connection error' });
        render();
      };
      ws.onclose = (event) => {
        pushWsMessage(req.id, {
          type: 'system',
          content: `Disconnected (${event.code}${event.reason ? `: ${event.reason}` : ''})`,
        });
        delete wsSockets[req.id];
        render();
      };
    } catch (err) {
      pushWsMessage(req.id, {
        type: 'system',
        content: `Failed: ${err instanceof Error ? err.message : String(err)}`,
      });
      render();
    }
  }

  function disconnectWebSocket(req) {
    const ws = wsSockets[req.id];
    if (ws) {
      try {
        ws.close();
      } catch {
        /* ignore */
      }
      delete wsSockets[req.id];
    }
    pushWsMessage(req.id, { type: 'system', content: 'Disconnected' });
    render();
  }

  function renderGraphQLPlayground(req) {
    initGraphqlRequest(req);
    const query = req.graphqlQuery ?? DEFAULT_GRAPHQL_QUERY;
    const variables = req.graphqlVariables ?? '{}';
    const gqlTabs = [
      ['query', 'Query'],
      ['variables', 'Variables'],
      ['headers', 'Headers'],
    ];
    const gqlTabHtml = gqlTabs
      .map(
        ([id, label]) =>
          `<button data-action="graphql-tab" data-tab="${id}" class="px-3 py-2.5 text-sm ${state.activeGraphqlTab === id ? 'tab-active' : 'text-gray-500 hover:text-gray-700'}">${label}</button>`
      )
      .join('');

    let editorContent = '';
    if (state.activeGraphqlTab === 'query') {
      editorContent = `<textarea data-action="set-graphql-query" data-env-autocomplete="1" class="flex-1 w-full p-4 font-mono text-sm bg-slate-900 text-slate-100 resize-none focus:outline-none min-h-[200px]" spellcheck="false">${escapeHtml(query)}</textarea>`;
    } else if (state.activeGraphqlTab === 'variables') {
      editorContent = `<textarea data-action="set-graphql-variables" data-env-autocomplete="1" class="flex-1 w-full p-4 font-mono text-sm bg-slate-900 text-slate-100 resize-none focus:outline-none min-h-[200px]" spellcheck="false">${escapeHtml(variables)}</textarea>`;
    } else {
      const enabledHeaders = req.headers.filter((h) => h.enabled);
      editorContent = `
        <div class="p-4 flex-1 overflow-y-auto">
          <div class="flex gap-4 text-sm py-2 border-b border-gray-100 dark:border-gray-800 mb-2">
            <span class="font-mono text-gray-500 w-36">Content-Type</span>
            <span class="font-mono">application/json</span>
          </div>
          <table class="w-full text-sm">
            <thead><tr class="border-b text-xs text-gray-400"><th class="w-8 px-3 py-2"></th><th class="text-left px-2 py-2">Key</th><th class="text-left px-2 py-2">Value</th><th class="w-8"></th></tr></thead>
            <tbody>${renderKeyValueTable(getRequestKeyValues(req, 'headers'), 'headers')}</tbody>
          </table>
        </div>`;
    }

    return `
      <div class="flex items-center gap-2 p-3 border-b border-gray-100 dark:border-gray-800 shrink-0">
        <span class="text-purple-600 font-bold text-sm">POST</span>
        ${renderBuilderTitleInput(req)}
        <span class="text-xs text-purple-600 font-medium px-2 py-0.5 bg-purple-50 dark:bg-purple-900/30 rounded">GraphQL Playground</span>
      </div>
      <div class="flex items-center gap-2 p-3 border-b border-gray-100 dark:border-gray-800 shrink-0">
        <input data-action="set-url" data-env-autocomplete="1" type="text" value="${escapeHtml(req.url)}" class="flex-1 px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 dark:bg-gray-800 rounded-lg font-mono focus:outline-none focus:ring-2 focus:ring-purple-500" placeholder="{{BASE_URL}}/graphql" />
        <button data-action="send-graphql" class="flex items-center gap-1 px-5 py-2 bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium rounded-lg disabled:opacity-50" ${sending ? 'disabled' : ''}>
          ${sending ? 'Executing...' : '▶ Execute Query'}
        </button>
      </div>
      <div class="flex items-center border-b border-gray-200 dark:border-gray-700 px-3 shrink-0">${gqlTabHtml}</div>
      <div class="flex-1 flex flex-col min-h-0 overflow-hidden">${editorContent}</div>`;
  }

  function renderWebSocketBuilder(req) {
    const msgs = wsMessages[req.id] ?? [];
    const msgHtml =
      msgs.length === 0
        ? '<div class="text-sm text-gray-400 text-center py-8">Connect to start messaging</div>'
        : msgs
            .map(
              (m) => `
        <div class="flex ${m.type === 'sent' ? 'justify-end' : 'justify-start'} mb-2">
          <div class="max-w-lg px-3 py-2 rounded-xl text-sm font-mono ${m.type === 'sent' ? 'bg-cyan-600 text-white' : m.type === 'system' ? 'bg-gray-200 dark:bg-gray-700 text-gray-600 w-full text-center' : 'bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700'}">${escapeHtml(m.content)}</div>
        </div>`
            )
            .join('');

    return `
      <div class="flex items-center gap-2 p-3 border-b border-gray-100 dark:border-gray-800 shrink-0">
        <span class="text-cyan-600 font-bold text-sm">WS</span>
        ${renderBuilderTitleInput(req)}
        <span class="text-xs text-cyan-600 font-medium px-2 py-0.5 bg-cyan-50 dark:bg-cyan-900/30 rounded">WebSocket</span>
      </div>
      <div class="flex items-center gap-2 p-3 border-b border-gray-100 dark:border-gray-800 shrink-0">
        <input data-action="set-url" data-env-autocomplete="1" type="text" value="${escapeHtml(req.url)}" class="flex-1 px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 dark:bg-gray-800 rounded-lg font-mono focus:outline-none focus:ring-2 focus:ring-cyan-500" placeholder="wss://host/path" />
        <button data-action="ws-connect" class="px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white text-sm font-medium rounded-lg">Connect</button>
        <button data-action="ws-disconnect" class="px-4 py-2 border border-gray-200 dark:border-gray-600 text-sm rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800">Disconnect</button>
      </div>
      <div class="flex-1 overflow-y-auto p-4 bg-gray-50 dark:bg-gray-950">${msgHtml}</div>
      <div class="flex gap-2 p-3 border-t border-gray-200 dark:border-gray-700 shrink-0">
        <input data-action="ws-message-input" type="text" placeholder="Type a message..." class="flex-1 px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 dark:bg-gray-800 rounded-lg font-mono" />
        <button data-action="ws-send" class="px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white text-sm rounded-lg">Send</button>
        <button data-action="ws-clear" class="px-3 py-2 text-sm text-gray-500 hover:text-gray-700">Clear</button>
      </div>`;
  }

  function renderSOAPBuilder(req) {
    initSoapRequest(req);
    const config = ensureRequestConfig(req);
    const soapTabs = [
      ['envelope', 'Envelope'],
      ['headers', 'Headers'],
      ['auth', 'Authorization'],
      ['wsdl', 'WSDL'],
      ['tests', 'Tests'],
    ];
    const soapTabHtml = soapTabs
      .map(
        ([id, label]) =>
          `<button data-action="soap-tab" data-tab="${id}" class="px-3 py-2.5 text-sm ${state.activeSoapTab === id ? 'tab-active' : 'text-gray-500 hover:text-gray-700'}">${label}</button>`
      )
      .join('');

    const contentType = config.soapContentType || 'text/xml';
    const soapAction = config.soapAction || DEFAULT_SOAP_ACTION;
    const wsdl = wsdlCache[req.id];
    const wsdlUrl = wsdl?.url ?? (req.url?.includes('?wsdl') ? req.url : `${(req.url || '{{BASE_URL}}/soap').replace(/\/$/, '')}?wsdl`);

    let editorContent = '';
    const tab = state.activeSoapTab || 'envelope';

    if (tab === 'envelope') {
      editorContent = `
        <div class="p-4 flex-1 overflow-y-auto flex flex-col gap-4">
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-3xl">
            <div>
              <label class="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Content-Type</label>
              <select data-action="set-soap-content-type" class="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 dark:bg-gray-800 rounded-lg">
                <option value="text/xml" ${contentType === 'text/xml' ? 'selected' : ''}>text/xml;charset=UTF-8</option>
                <option value="application/soap+xml" ${contentType === 'application/soap+xml' ? 'selected' : ''}>application/soap+xml</option>
              </select>
            </div>
            <div>
              <label class="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">SOAPAction</label>
              <input data-action="set-soap-action" data-env-autocomplete="1" type="text" value="${escapeHtml(soapAction)}" placeholder="GetUser" class="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 dark:bg-gray-800 rounded-lg font-mono" />
            </div>
          </div>
          <div class="flex items-center gap-2 text-xs text-gray-500 bg-orange-50 dark:bg-orange-900/20 border border-orange-100 dark:border-orange-900/40 rounded-lg px-3 py-2">
            <span class="font-semibold text-orange-700 dark:text-orange-300">Headers sent:</span>
            <code class="font-mono">Content-Type: ${escapeHtml(contentType)}; charset=UTF-8</code>
            <span>·</span>
            <code class="font-mono">SOAPAction: "${escapeHtml(soapAction)}"</code>
          </div>
          <div class="flex items-center justify-between gap-2">
            <label class="text-xs font-semibold text-gray-500 uppercase tracking-wider">SOAP Envelope (XML)</label>
            <button data-action="format-soap-xml" class="text-xs px-2 py-1 border border-gray-200 dark:border-gray-600 rounded hover:bg-gray-50 dark:hover:bg-gray-800">Pretty Format</button>
          </div>
          <textarea data-action="set-soap-body" data-env-autocomplete="1" class="flex-1 w-full min-h-[240px] p-4 font-mono text-sm bg-slate-900 text-slate-100 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-orange-500/40" spellcheck="false">${escapeHtml(req.body || DEFAULT_SOAP_ENVELOPE)}</textarea>
          <p class="text-xs text-gray-400">SOAP uses XML instead of JSON. Use <code class="font-mono">{{BASE_URL}}</code> and other environment variables in the URL, SOAPAction, and envelope body.</p>
        </div>`;
    } else if (tab === 'headers') {
      editorContent = renderKeyValuePanel(req, 'headers', 'Headers', 'Custom headers (Content-Type and SOAPAction are set automatically)');
    } else if (tab === 'auth') {
      editorContent = renderAuthPanel(req);
    } else if (tab === 'wsdl') {
      const ops = wsdl?.operations ?? [];
      editorContent = `
        <div class="p-4 flex-1 overflow-y-auto space-y-4">
          <div>
            <h3 class="font-semibold text-sm mb-1">Import WSDL</h3>
            <p class="text-xs text-gray-500 mb-3">Load a WSDL URL to discover SOAP operations, actions, and auto-generate request envelopes.</p>
            <div class="flex flex-wrap gap-2">
              <input data-action="wsdl-url-input" type="text" value="${escapeHtml(wsdl?.url ?? wsdlUrl ?? '')}" placeholder="https://example.com/service?wsdl" class="flex-1 min-w-[220px] px-3 py-2 text-sm font-mono border border-gray-200 dark:border-gray-700 dark:bg-gray-800 rounded-lg" />
              <button data-action="fetch-wsdl" class="px-4 py-2 text-sm bg-orange-600 hover:bg-orange-700 text-white rounded-lg font-medium ${wsdl?.loading ? 'opacity-60' : ''}" ${wsdl?.loading ? 'disabled' : ''}>${wsdl?.loading ? 'Loading...' : 'Load WSDL'}</button>
            </div>
            ${wsdl?.error ? `<p class="text-sm text-red-600 mt-2">${escapeHtml(wsdl.error)}</p>` : ''}
          </div>
          ${ops.length ? `
            <div>
              <h4 class="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Operations (${ops.length})</h4>
              <div class="space-y-2 max-h-64 overflow-y-auto">
                ${ops.map((op) => `
                  <button data-action="apply-wsdl-operation" data-op-name="${escapeHtml(op.name)}" data-op-action="${escapeHtml(op.soapAction)}" class="w-full text-left p-3 border border-gray-200 dark:border-gray-700 rounded-lg hover:border-orange-400 hover:bg-orange-50/50 dark:hover:bg-orange-900/10">
                    <div class="font-medium text-sm">${escapeHtml(op.name)}</div>
                    <div class="text-xs font-mono text-gray-500 mt-1">SOAPAction: "${escapeHtml(op.soapAction)}"</div>
                  </button>`).join('')}
              </div>
            </div>` : '<p class="text-sm text-gray-400">No operations loaded yet. Enter a WSDL URL and click Load WSDL.</p>'}
        </div>`;
    } else if (tab === 'tests') {
      editorContent = `
        <div class="p-4 flex-1 overflow-y-auto flex flex-col gap-2">
          <p class="text-xs text-gray-400">Post-response tests and assertions for SOAP responses.</p>
          <textarea data-action="set-test-script" rows="14" class="flex-1 w-full px-3 py-2 text-sm font-mono border border-gray-200 dark:border-gray-700 dark:bg-gray-900 dark:text-slate-100 rounded-lg resize-none min-h-[220px]" spellcheck="false" placeholder="// e.g. expect status 200">${escapeHtml(config.testScript || '')}</textarea>
        </div>`;
    }

    return `
      <div class="flex items-center gap-2 p-3 border-b border-gray-100 dark:border-gray-800 shrink-0">
        <span class="text-orange-600 font-bold text-sm">POST</span>
        ${renderBuilderTitleInput(req)}
        <span class="text-xs text-orange-600 font-medium px-2 py-0.5 bg-orange-50 dark:bg-orange-900/30 rounded">SOAP</span>
      </div>
      <div class="flex items-center gap-2 p-3 border-b border-gray-100 dark:border-gray-800 shrink-0">
        <input data-action="set-url" data-env-autocomplete="1" type="text" value="${escapeHtml(req.url)}" class="flex-1 px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 dark:bg-gray-800 rounded-lg font-mono focus:outline-none focus:ring-2 focus:ring-orange-500" placeholder="{{BASE_URL}}/service" />
        <button data-action="send" class="flex items-center gap-1 px-5 py-2 bg-orange-600 hover:bg-orange-700 text-white text-sm font-medium rounded-lg disabled:opacity-50" ${sending ? 'disabled' : ''}>
          ${sending ? 'Sending...' : '▶ Send SOAP'}
        </button>
      </div>
      <div class="flex items-center border-b border-gray-200 dark:border-gray-700 px-3 shrink-0">${soapTabHtml}</div>
      <div class="flex-1 flex flex-col min-h-0 overflow-hidden">${editorContent}</div>`;
  }

  function renderGrpcBuilder(req) {
    req.method = 'POST';
    const config = ensureRequestConfig(req);
    if (!config.bodyType || config.bodyType === 'none') {
      config.bodyType = 'json';
      req.bodyType = 'json';
    }
    if (!req.body?.trim()) {
      req.body = '{}';
      config.body = req.body;
    }

    return `
      <div class="flex items-center gap-2 p-3 border-b border-gray-100 dark:border-gray-800 shrink-0">
        <span class="text-green-600 font-bold text-sm">POST</span>
        ${renderBuilderTitleInput(req)}
        <span class="text-xs text-green-600 font-medium px-2 py-0.5 bg-green-50 dark:bg-green-900/30 rounded">gRPC</span>
      </div>
      <div class="flex items-center gap-2 p-3 border-b border-gray-100 dark:border-gray-800 shrink-0">
        <input data-action="set-url" data-env-autocomplete="1" type="text" value="${escapeHtml(req.url)}" class="flex-1 px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 dark:bg-gray-800 rounded-lg font-mono focus:outline-none focus:ring-2 focus:ring-green-500" placeholder="{{BASE_URL}}/package.Service/Method" />
        <button data-action="send" class="flex items-center gap-1 px-5 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-lg disabled:opacity-50" ${sending ? 'disabled' : ''}>
          ${sending ? 'Invoking...' : '▶ Invoke'}
        </button>
      </div>
      <div class="flex-1 flex flex-col min-h-0 overflow-hidden p-4 gap-2">
        <p class="text-xs text-gray-400">Uses HTTP POST for gRPC-Gateway / gRPC-Web endpoints. Native gRPC (HTTP/2 + protobuf) is not supported yet.</p>
        <textarea data-action="set-body" data-env-autocomplete="1" class="flex-1 w-full p-4 font-mono text-sm bg-slate-900 text-slate-100 resize-none focus:outline-none min-h-[200px]" spellcheck="false" placeholder="{}">${escapeHtml(req.body ?? '{}')}</textarea>
      </div>`;
  }

  function renderRequestBuilder(req) {
    const protocol = getRequestProtocol(req);
    if (protocol === 'graphql') return renderGraphQLPlayground(req);
    if (protocol === 'soap') return renderSOAPBuilder(req);
    if (protocol === 'websocket') return renderWebSocketBuilder(req);
    if (protocol === 'grpc') return renderGrpcBuilder(req);

    const headerCount = req.headers.filter((h) => h.enabled && h.key).length;
    const config = ensureRequestConfig(req);
    const requestTabs = [
      ['params', 'Params'],
      ['auth', 'Authorization'],
      ['headers', `Headers (${headerCount})`],
      ['body', 'Body'],
      ['scripts', 'Pre-request Script'],
      ['tests', 'Tests'],
      ['settings', 'Settings'],
    ];
    const reqTabHtml = requestTabs
      .map(
        ([id, label]) =>
          `<button data-action="request-tab" data-tab="${id}" class="px-3 py-2.5 text-sm whitespace-nowrap shrink-0 ${state.activeRequestTab === id ? 'tab-active' : 'text-gray-500 hover:text-gray-700'}">${label}</button>`
      )
      .join('');

    return `
      <div class="flex items-center gap-2 p-3 border-b border-gray-100 dark:border-gray-800 shrink-0 flex-wrap">
        <select data-action="set-method" class="http-method-select text-sm font-bold method-${req.method.toLowerCase()} shrink-0">
          ${['GET', 'POST', 'PUT', 'DELETE', 'PATCH'].map((m) => `<option ${req.method === m ? 'selected' : ''}>${m}</option>`).join('')}
        </select>
        ${renderBuilderTitleInput(req)}
        ${renderBuilderProtocolChip(req)}
        <input data-action="set-url" data-env-autocomplete="1" type="text" value="${escapeHtml(req.url)}" class="flex-1 min-w-[12rem] px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 dark:bg-gray-800 rounded-lg font-mono focus:outline-none focus:ring-2 focus:ring-blue-500" />
        <button data-action="send" class="flex items-center gap-1 px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg disabled:opacity-50 shrink-0" ${sending ? 'disabled' : ''}>
          ${sending ? '<span class="spinner inline-block">↻</span> Sending...' : 'Send ▾'}
        </button>
      </div>
      <div class="flex items-center border-b border-gray-200 dark:border-gray-700 px-3 shrink-0 min-w-0">
        <div class="flex items-center overflow-x-auto flex-1 min-w-0">${reqTabHtml}</div>
        <button data-action="request-tab" data-tab="cookies" class="px-3 py-2.5 text-sm whitespace-nowrap shrink-0 ml-2 ${state.activeRequestTab === 'cookies' ? 'tab-active text-blue-600' : 'text-blue-600 hover:text-blue-800'}">Cookies</button>
      </div>
      ${renderRequestTabContent(req)}`;
  }

  function renderRequestTabContent(req) {
    const tab = state.activeRequestTab;
    const config = ensureRequestConfig(req);
    if (tab === 'params') {
      return renderKeyValuePanel(req, 'params', 'Query Params', '');
    }
    if (tab === 'headers') {
      const enabled = req.headers.filter((h) => h.enabled && h.key).length;
      return renderKeyValuePanel(req, 'headers', 'Headers', `${enabled} header(s) enabled`);
    }
    if (tab === 'auth') {
      return renderAuthPanel(req);
    }
    if (tab === 'body') {
      const bodyType = req.bodyType || config.bodyType || 'none';
      return `
        <div class="p-4 flex-1 overflow-y-auto flex flex-col gap-3">
          <select data-action="set-body-type" class="w-full max-w-xs px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 dark:bg-gray-800 rounded-lg">
            <option value="none" ${bodyType === 'none' ? 'selected' : ''}>None</option>
            <option value="json" ${bodyType === 'json' ? 'selected' : ''}>JSON</option>
            <option value="text" ${bodyType === 'text' ? 'selected' : ''}>Raw text</option>
            <option value="xml" ${bodyType === 'xml' ? 'selected' : ''}>XML</option>
            <option value="form-urlencoded" ${bodyType === 'form-urlencoded' ? 'selected' : ''}>x-www-form-urlencoded</option>
          </select>
          ${bodyType === 'none'
            ? '<p class="text-sm text-gray-400">No request body will be sent.</p>'
            : `<textarea data-action="set-body" data-env-autocomplete="1" rows="12" class="flex-1 w-full px-3 py-2 text-sm font-mono border border-gray-200 dark:border-gray-700 dark:bg-gray-800 rounded-lg resize-none min-h-[200px]" spellcheck="false">${escapeHtml(req.body)}</textarea>`}
        </div>`;
    }
    if (tab === 'scripts') {
      return `
        <div class="p-4 flex-1 overflow-y-auto flex flex-col gap-2">
          <p class="text-xs text-gray-400">Runs before the request is sent. Saved with this request.</p>
          <textarea data-action="set-pre-request-script" rows="14" class="flex-1 w-full px-3 py-2 text-sm font-mono border border-gray-200 dark:border-gray-700 dark:bg-gray-900 dark:text-slate-100 rounded-lg resize-none min-h-[220px]" spellcheck="false" placeholder="// Pre-request script">${escapeHtml(config.preRequestScript || '')}</textarea>
        </div>`;
    }
    if (tab === 'tests') {
      return `
        <div class="p-4 flex-1 overflow-y-auto flex flex-col gap-2">
          <p class="text-xs text-gray-400">Post-response tests and assertions. Saved with this request.</p>
          <textarea data-action="set-test-script" rows="14" class="flex-1 w-full px-3 py-2 text-sm font-mono border border-gray-200 dark:border-gray-700 dark:bg-gray-900 dark:text-slate-100 rounded-lg resize-none min-h-[220px]" spellcheck="false" placeholder="// e.g. expect status 200">${escapeHtml(config.testScript || '')}</textarea>
        </div>`;
    }
    if (tab === 'settings') {
      const settings = config.settings || { followRedirects: true, validateSsl: true, timeoutMs: 0 };
      return `
        <div class="p-4 flex-1 overflow-y-auto space-y-4 max-w-lg">
          <label class="flex items-center gap-3 text-sm">
            <input type="checkbox" data-action="set-request-setting" data-setting="followRedirects" ${settings.followRedirects !== false ? 'checked' : ''} class="rounded border-gray-300 text-blue-600" />
            <span>Follow redirects</span>
          </label>
          <label class="flex items-center gap-3 text-sm">
            <input type="checkbox" data-action="set-request-setting" data-setting="validateSsl" ${settings.validateSsl !== false ? 'checked' : ''} class="rounded border-gray-300 text-blue-600" />
            <span>Enable SSL certificate verification</span>
          </label>
          <div>
            <label class="block text-xs font-medium text-gray-500 mb-1.5">Request timeout (ms)</label>
            <input data-action="set-request-timeout" type="number" min="0" step="1000" value="${settings.timeoutMs || 0}" class="w-full max-w-xs px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 dark:bg-gray-800 rounded-lg font-mono" placeholder="0 = default (30s)" />
            <p class="text-xs text-gray-400 mt-1">Use 0 for the default 30 second timeout.</p>
          </div>
        </div>`;
    }
    if (tab === 'cookies') {
      const cookieCount = (config.cookies || []).filter((c) => c.enabled && c.key).length;
      return `
        <div class="p-4 flex-1 overflow-y-auto">
          <p class="text-xs text-gray-400 mb-2">${cookieCount} cookie(s) enabled — sent as Cookie header</p>
          <table class="w-full text-sm">
            <thead><tr class="border-b text-xs text-gray-400"><th class="w-8 px-3 py-2"></th><th class="text-left px-2 py-2">Name</th><th class="text-left px-2 py-2">Value</th><th class="w-8"></th></tr></thead>
            <tbody>${renderKeyValueTable(getRequestKeyValues(req, 'cookies'), 'cookies')}</tbody>
          </table>
        </div>`;
    }
    return `<div class="p-4 text-sm text-gray-400">Select a tab above</div>`;
  }

  function parseUrlQueryParams(url) {
    try {
      return [...new URL(url).searchParams.entries()].map(([key, value]) => ({ key, value }));
    } catch {
      return [];
    }
  }

  function renderHeaderRows(headers) {
    const entries = Object.entries(headers || {});
    if (entries.length === 0) {
      return '<tr><td colspan="2" class="px-3 py-2 text-xs text-gray-400">None</td></tr>';
    }
    return entries
      .map(
        ([k, v]) =>
          `<tr class="border-b border-gray-50 dark:border-gray-800"><td class="px-3 py-1.5 font-mono text-xs font-medium align-top">${escapeHtml(k)}</td><td class="px-3 py-1.5 font-mono text-xs text-gray-600 dark:text-gray-400 break-all">${escapeHtml(v)}</td></tr>`
      )
      .join('');
  }

  function renderQueryParamRows(url) {
    const params = parseUrlQueryParams(url);
    if (params.length === 0) {
      return '<tr><td colspan="2" class="px-3 py-2 text-xs text-gray-400">None</td></tr>';
    }
    return params
      .map(
        ({ key, value }) =>
          `<tr class="border-b border-gray-50 dark:border-gray-800"><td class="px-3 py-1.5 font-mono text-xs font-medium align-top">${escapeHtml(key)}</td><td class="px-3 py-1.5 font-mono text-xs text-gray-600 dark:text-gray-400 break-all">${escapeHtml(value)}</td></tr>`
      )
      .join('');
  }

  function renderRequestDetailsSection(reqSnapshot) {
    if (!reqSnapshot) return '';
    return `
      <section class="response-detail-section">
        <h3 class="response-detail-heading">Request</h3>
        <div class="px-3 py-2 border-b border-gray-100 dark:border-gray-800">
          <div class="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">Method</div>
          <div class="font-mono text-xs">${escapeHtml(reqSnapshot.method)}</div>
        </div>
        <div class="px-3 py-2 border-b border-gray-100 dark:border-gray-800">
          <div class="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">URL</div>
          <div class="font-mono text-xs break-all text-gray-700 dark:text-gray-300">${escapeHtml(reqSnapshot.url)}</div>
        </div>
        <div class="border-b border-gray-100 dark:border-gray-800">
          <div class="px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-gray-400">Query Params</div>
          <table class="w-full text-sm"><tbody>${renderQueryParamRows(reqSnapshot.url)}</tbody></table>
        </div>
        <div>
          <div class="px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-gray-400">Request Headers</div>
          <table class="w-full text-sm"><tbody>${renderHeaderRows(reqSnapshot.headers)}</tbody></table>
        </div>
      </section>`;
  }

  function getResponseDownloadPayload() {
    const resp = state.lastResponse;
    if (!resp) return null;

    const tab = state.activeResponseTab;
    const activeReq = getActiveRequest();
    const isSoap = getRequestProtocol(activeReq) === 'soap';
    const isXml = isXmlContent(resp.body, resp.headers);
    const statusPrefix = resp.status ? `response-${resp.status}` : 'response';

    if (tab === 'headers') {
      const requestSection = resp.request
        ? [
            '=== REQUEST ===',
            `Method: ${resp.request.method}`,
            `URL: ${resp.request.url}`,
            '',
            'Query Params:',
            ...parseUrlQueryParams(resp.request.url).map(({ key, value }) => `${key}: ${value}`),
            '',
            'Request Headers:',
            ...Object.entries(resp.request.headers).map(([key, value]) => `${key}: ${value}`),
            '',
            '=== RESPONSE ===',
            'Response Headers:',
          ].join('\n')
        : '=== RESPONSE ===\nResponse Headers:\n';
      return {
        content:
          requestSection +
          Object.entries(resp.headers)
            .map(([key, value]) => `${key}: ${value}`)
            .join('\n'),
        filename: `${statusPrefix}-headers.txt`,
        mime: 'text/plain',
      };
    }

    if (tab === 'timeline') {
      return {
        content: JSON.stringify(
          {
            status: resp.status,
            statusText: resp.statusText,
            durationMs: resp.durationMs,
            timeline: resp.timeline ?? [],
          },
          null,
          2
        ),
        filename: `${statusPrefix}-timeline.json`,
        mime: 'application/json',
      };
    }

    if (tab === 'tree') {
      return {
        content: resp.body,
        filename: `${statusPrefix}.xml`,
        mime: 'application/xml',
      };
    }

    if (tab === 'xml' || (tab === 'json' && isSoap && isXml)) {
      return {
        content: formatXml(resp.body),
        filename: `${statusPrefix}.xml`,
        mime: 'application/xml',
      };
    }

    if (tab === 'json') {
      const looksJson =
        resp.headers['content-type']?.includes('json') ||
        resp.body.trim().startsWith('{') ||
        resp.body.trim().startsWith('[');
      if (looksJson) {
        try {
          return {
            content: JSON.stringify(JSON.parse(resp.body), null, 2),
            filename: `${statusPrefix}.json`,
            mime: 'application/json',
          };
        } catch {
          /* fall through to raw body */
        }
      }
      return {
        content: resp.body,
        filename: `${statusPrefix}.txt`,
        mime: 'text/plain',
      };
    }

    return {
      content: resp.body,
      filename: `${statusPrefix}.txt`,
      mime: 'text/plain',
    };
  }

  function downloadResponse() {
    const payload = getResponseDownloadPayload();
    if (!payload) return;

    const blob = new Blob([payload.content], { type: payload.mime });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = payload.filename;
    link.click();
    URL.revokeObjectURL(url);
    vscode.postMessage({ type: 'notify', message: `Downloaded ${payload.filename}`, level: 'success' });
  }

  function renderResponseContent() {
    const resp = state.lastResponse;
    const tab = state.activeResponseTab;
    const activeReq = getActiveRequest();
    const isSoap = getRequestProtocol(activeReq) === 'soap';
    const isXml = resp && isXmlContent(resp.body, resp.headers);

    if (!resp) {
      return `<div class="flex-1 flex items-center justify-center text-gray-400 text-sm p-8 min-h-0">Click <strong class="mx-1">Send</strong> to execute the request</div>`;
    }

    const toolbarClass = 'response-toolbar flex items-center justify-end gap-1 px-3 py-1.5 border-b border-gray-100 dark:border-gray-800';

    if (tab === 'xml' || (tab === 'json' && isSoap && isXml)) {
      const pretty = formatXml(resp.body);
      return `
        <div class="${toolbarClass}">
          <button data-action="copy-response" class="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 rounded" title="Copy">📋</button>
          <button data-action="download-response" class="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 rounded" title="Download response">${iconSvg('export')}</button>
          <button data-action="format-response" class="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 rounded" title="Format">≡</button>
        </div>
        <pre class="response-json-view soap-xml-view">${highlightXml(pretty)}</pre>`;
    }
    if (tab === 'tree') {
      return `
        <div class="${toolbarClass}">
          <button data-action="download-response" class="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 rounded" title="Download response">${iconSvg('export')}</button>
        </div>
        <div class="response-scroll-body p-3">${renderXmlTree(resp.body)}</div>`;
    }

    if (tab === 'json') {
      const isJson = resp.headers['content-type']?.includes('json') || resp.body.trim().startsWith('{') || resp.body.trim().startsWith('[');
      const content = isJson ? highlightJson(resp.body) : escapeHtml(resp.body);
      return `
        <div class="${toolbarClass}">
          <button data-action="copy-response" class="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 rounded" title="Copy">📋</button>
          <button data-action="download-response" class="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 rounded" title="Download response">${iconSvg('export')}</button>
          <button data-action="format-response" class="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 rounded" title="Format">≡</button>
        </div>
        <pre class="response-json-view">${content}</pre>`;
    }
    if (tab === 'raw') {
      return `
        <div class="${toolbarClass}">
          <button data-action="copy-response" class="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 rounded" title="Copy">📋</button>
          <button data-action="download-response" class="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 rounded" title="Download response">${iconSvg('export')}</button>
        </div>
        <pre class="response-raw-view">${escapeHtml(resp.body)}</pre>`;
    }
    if (tab === 'headers') {
      const responseRows = renderHeaderRows(resp.headers);
      return `
        <div class="${toolbarClass}">
          <button data-action="download-response" class="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 rounded" title="Download headers">${iconSvg('export')}</button>
        </div>
        <div class="response-scroll-body">
          ${renderRequestDetailsSection(resp.request)}
          <section class="response-detail-section">
            <h3 class="response-detail-heading">Response Headers</h3>
            <table class="w-full text-sm"><tbody>${responseRows}</tbody></table>
          </section>
        </div>`;
    }
    if (tab === 'timeline') {
      return `
        <div class="${toolbarClass}">
          <button data-action="download-response" class="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 rounded" title="Download timeline">${iconSvg('export')}</button>
        </div>
        <div class="response-scroll-body p-4">${renderTimeline(resp.timeline)}</div>`;
    }
    return '';
  }

  /** @type {Record<string, boolean>} */
  let revealedVars = {};

  /** @type {null | { mode: string; id?: string; sourceId?: string; sourceName?: string; name?: string; color?: string }} */
  let envModal = null;

  const ENV_COLORS = [
    '#2563EB', '#7C3AED', '#10B981', '#F59E0B', '#EF4444',
    '#06B6D4', '#EC4899', '#6366F1', '#14B8A6', '#F97316',
  ];

  function resolveEnvColor(color) {
    if (color?.startsWith('#')) return color;
    const map = { green: '#10B981', orange: '#F59E0B', blue: '#2563EB', red: '#EF4444', purple: '#7C3AED', cyan: '#06B6D4' };
    return map[color] ?? ENV_COLORS[0];
  }

  function envDotHtml(color) {
    if (color?.startsWith('#')) {
      return `<span class="w-3 h-3 rounded-full shrink-0" style="background-color:${color}"></span>`;
    }
    return `<span class="w-3 h-3 rounded-full shrink-0 env-dot-${color || 'blue'}"></span>`;
  }

  function envBadgeHtml(color, name) {
    if (!name) return '';
    const resolved = resolveEnvColor(color);
    if (color?.startsWith('#')) {
      return `<span class="env-badge px-1.5 py-0.5 text-xs font-medium rounded" style="background-color:${resolved}1a;color:${resolved};">${escapeHtml(name)}</span>`;
    }
    return `<span class="env-badge px-1.5 py-0.5 text-xs font-medium rounded env-badge-${color || 'green'}">${escapeHtml(name)}</span>`;
  }

  function renderEnvironmentModal() {
    if (!envModal) return '';
    const mode = envModal.mode;
    const title =
      mode === 'create' ? 'New Environment' :
      mode === 'edit' ? 'Edit Environment' :
      'Duplicate Environment';
    const subtitle =
      mode === 'create' ? 'Add an environment for this project' :
      mode === 'edit' ? 'Update the environment name or color' :
      `Copy all variables from "${escapeHtml(envModal.sourceName ?? '')}"`;
    const submitLabel =
      mode === 'create' ? 'Create Environment' :
      mode === 'edit' ? 'Save Changes' :
      'Duplicate Environment';
    const name = envModal.name ?? '';
    const color = envModal.color ?? ENV_COLORS[0];
    const colorPicker = ENV_COLORS.map(
      (c) =>
        `<button type="button" data-action="env-modal-color" data-color="${c}" class="w-8 h-8 rounded-full ${color === c ? 'ring-2 ring-offset-2 ring-blue-500 scale-110' : ''}" style="background-color:${c}"></button>`
    ).join('');

    return `
      <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" data-action="env-modal-backdrop">
        <div class="bg-white dark:bg-gray-900 rounded-xl shadow-xl w-full max-w-md mx-4 overflow-hidden border border-gray-200 dark:border-gray-700">
          <div class="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
            <div>
              <h2 class="text-lg font-bold">${title}</h2>
              <p class="text-sm text-gray-500">${subtitle}</p>
            </div>
            <button data-action="env-modal-close" class="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500">✕</button>
          </div>
          <div class="p-6 space-y-4">
            <div>
              <label class="block text-xs font-semibold text-gray-500 uppercase mb-2">Name *</label>
              <input data-action="env-modal-name" type="text" value="${escapeHtml(name)}" placeholder="e.g. dev, prod, UAT" class="w-full px-4 py-2.5 border border-gray-200 dark:border-gray-700 dark:bg-gray-800 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label class="block text-xs font-semibold text-gray-500 uppercase mb-2">Color</label>
              <div class="flex flex-wrap gap-2">${colorPicker}</div>
            </div>
            <div class="flex justify-end gap-3 pt-2">
              <button data-action="env-modal-close" class="px-4 py-2 text-sm rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800">Cancel</button>
              <button data-action="env-modal-submit" class="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium">${submitLabel}</button>
            </div>
          </div>
        </div>
      </div>`;
  }

  function openEnvModal(modal) {
    envModal = modal;
    render();
  }

  function closeEnvModal() {
    envModal = null;
    render();
  }

  function submitEnvModal() {
    if (!envModal) return;
    const nameInput = document.querySelector('[data-action="env-modal-name"]');
    const name = nameInput?.value?.trim();
    if (!name) {
      vscode.postMessage({ type: 'notify', message: 'Environment name is required', level: 'error' });
      return;
    }
    const color = envModal.color ?? ENV_COLORS[0];
    if (envModal.mode === 'create') {
      vscode.postMessage({ type: 'createEnvironment', name, color });
    } else if (envModal.mode === 'edit' && envModal.id) {
      vscode.postMessage({ type: 'updateEnvironment', environmentId: envModal.id, name, color });
    } else if (envModal.mode === 'duplicate' && envModal.sourceId) {
      vscode.postMessage({ type: 'duplicateEnvironment', sourceId: envModal.sourceId, name, color });
    }
    closeEnvModal();
  }

  /** @type {null | { mode: string; id?: string; name?: string; description?: string }} */
  let projectModal = null;
  /** @type {null | { id: string; name: string }} */
  let deleteProjectModal = null;
  /** @type {null | { id: string; name: string }} */
  let deleteEnvironmentModal = null;
  /** @type {null | { id: string; name: string; collectionName: string }} */
  let deleteRequestModal = null;
  /** @type {null | { id: string; name: string }} */
  let collectionModal = null;
  /** @type {null | { id: string; name: string }} */
  let deleteCollectionModal = null;

  function renderDeleteRequestModal() {
    if (!deleteRequestModal) return '';
    const name = deleteRequestModal.name ?? 'this request';
    const collectionName = deleteRequestModal.collectionName ?? 'collection';

    return `
      <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" data-action="delete-request-modal-backdrop">
        <div class="bg-white dark:bg-gray-900 rounded-xl shadow-xl w-full max-w-md mx-4 overflow-hidden border border-gray-200 dark:border-gray-700">
          <div class="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-xl bg-red-50 dark:bg-red-900/30 flex items-center justify-center text-red-500">⚠</div>
              <div>
                <h2 class="text-lg font-bold">Delete Request</h2>
                <p class="text-sm text-gray-500">This action cannot be undone</p>
              </div>
            </div>
            <button data-action="delete-request-modal-close" class="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500">✕</button>
          </div>
          <div class="p-6">
            <p class="text-sm text-gray-600 dark:text-gray-400">Delete <strong>${escapeHtml(name)}</strong> from <strong>${escapeHtml(collectionName)}</strong>?</p>
          </div>
          <div class="flex justify-end gap-3 px-6 py-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50">
            <button data-action="delete-request-modal-close" class="px-4 py-2 text-sm rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800">Cancel</button>
            <button data-action="delete-request-modal-submit" class="px-4 py-2 text-sm bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium">Delete Request</button>
          </div>
        </div>
      </div>`;
  }

  function openDeleteRequestModal(target) {
    deleteRequestModal = target;
    render();
  }

  function closeDeleteRequestModal() {
    deleteRequestModal = null;
    render();
  }

  function submitDeleteRequestModal() {
    if (!deleteRequestModal) return;
    const requestId = deleteRequestModal.id;
    clearTimeout(saveTimer);
    saveTimer = null;
    requestDeletePending = true;

    for (const folder of state?.folders ?? []) {
      folder.requests = folder.requests.filter((r) => r.id !== requestId);
    }
    state.openTabs = (state.openTabs ?? []).filter((id) => id !== requestId);
    if (state.activeTabId === requestId) {
      state.activeTabId = state.openTabs[0] ?? '';
    }

    deleteRequestModal = null;
    render();
    vscode.postMessage({ type: 'deleteRequest', requestId });
  }

  function renderDeleteEnvironmentModal() {
    if (!deleteEnvironmentModal) return '';
    const name = deleteEnvironmentModal.name ?? 'this environment';

    return `
      <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" data-action="delete-env-modal-backdrop">
        <div class="bg-white dark:bg-gray-900 rounded-xl shadow-xl w-full max-w-md mx-4 overflow-hidden border border-gray-200 dark:border-gray-700">
          <div class="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-xl bg-red-50 dark:bg-red-900/30 flex items-center justify-center text-red-500">⚠</div>
              <div>
                <h2 class="text-lg font-bold">Delete Environment</h2>
                <p class="text-sm text-gray-500">This action cannot be undone</p>
              </div>
            </div>
            <button data-action="delete-env-modal-close" class="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500">✕</button>
          </div>
          <div class="p-6">
            <p class="text-sm text-gray-600 dark:text-gray-400">Are you sure you want to delete <strong>${escapeHtml(name)}</strong>? All variables in this environment will be permanently removed.</p>
          </div>
          <div class="flex justify-end gap-3 px-6 py-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50">
            <button data-action="delete-env-modal-close" class="px-4 py-2 text-sm rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800">Cancel</button>
            <button data-action="delete-env-modal-submit" class="px-4 py-2 text-sm bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium">Delete Environment</button>
          </div>
        </div>
      </div>`;
  }

  function openDeleteEnvironmentModal(target) {
    deleteEnvironmentModal = target;
    render();
  }

  function closeDeleteEnvironmentModal() {
    deleteEnvironmentModal = null;
    render();
  }

  function submitDeleteEnvironmentModal() {
    if (!deleteEnvironmentModal) return;
    vscode.postMessage({ type: 'deleteEnvironment', environmentId: deleteEnvironmentModal.id });
    closeDeleteEnvironmentModal();
  }

  function renderDeleteProjectModal() {
    if (!deleteProjectModal) return '';
    const name = deleteProjectModal.name ?? 'this project';

    return `
      <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" data-action="delete-project-modal-backdrop">
        <div class="bg-white dark:bg-gray-900 rounded-xl shadow-xl w-full max-w-md mx-4 overflow-hidden border border-gray-200 dark:border-gray-700">
          <div class="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-xl bg-red-50 dark:bg-red-900/30 flex items-center justify-center text-red-500">⚠</div>
              <div>
                <h2 class="text-lg font-bold">Delete Project</h2>
                <p class="text-sm text-gray-500">This action cannot be undone</p>
              </div>
            </div>
            <button data-action="delete-project-modal-close" class="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500">✕</button>
          </div>
          <div class="p-6">
            <p class="text-sm text-gray-600 dark:text-gray-400">Are you sure you want to delete <strong>${escapeHtml(name)}</strong>? All collections, requests, and environment variables for this project will be permanently removed.</p>
          </div>
          <div class="flex justify-end gap-3 px-6 py-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50">
            <button data-action="delete-project-modal-close" class="px-4 py-2 text-sm rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800">Cancel</button>
            <button data-action="delete-project-modal-submit" class="px-4 py-2 text-sm bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium">Delete Project</button>
          </div>
        </div>
      </div>`;
  }

  function openDeleteProjectModal(target) {
    deleteProjectModal = target;
    render();
  }

  function closeDeleteProjectModal() {
    deleteProjectModal = null;
    render();
  }

  function submitDeleteProjectModal() {
    if (!deleteProjectModal) return;
    const projectId = deleteProjectModal.id;
    clearTimeout(saveTimer);
    saveTimer = null;
    projectDeletePending = true;

    state.projects = (state.projects ?? []).filter((p) => p.id !== projectId);
    if (state.projectId === projectId) {
      const next = state.projects[0];
      state.projectId = next?.id ?? '';
      state.projectName = next?.name ?? '';
      state.projectDescription = next?.description ?? '';
      if (!next) {
        state.folders = [];
        state.openTabs = [];
        state.activeTabId = '';
        state.environments = [];
        state.activeEnvironmentId = '';
      }
    }
    if (state.planLimits) {
      state.planLimits = {
        ...state.planLimits,
        projectCount: state.projects.length,
        canCreateProject: true,
      };
    }
    state.sidebarNav = 'workspace';

    deleteProjectModal = null;
    render();
    vscode.postMessage({ type: 'deleteProject', projectId });
  }

  function renderProjectModal() {
    if (!projectModal) return '';
    const isCreate = projectModal.mode === 'create';
    const title = isCreate ? 'New Project' : 'Edit Project';
    const subtitle = isCreate ? 'Create a new API client project' : 'Update project name or description';
    const submitLabel = isCreate ? 'Create Project' : 'Save Changes';
    const name = projectModal.name ?? '';
    const description = projectModal.description ?? '';

    return `
      <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" data-action="project-modal-backdrop">
        <div class="bg-white dark:bg-gray-900 rounded-xl shadow-xl w-full max-w-md mx-4 overflow-hidden border border-gray-200 dark:border-gray-700">
          <div class="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
            <div>
              <h2 class="text-lg font-bold">${title}</h2>
              <p class="text-sm text-gray-500">${subtitle}</p>
            </div>
            <button data-action="project-modal-close" class="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500">✕</button>
          </div>
          <div class="p-6 space-y-4">
            <div>
              <label class="block text-xs font-semibold text-gray-500 uppercase mb-2">Name *</label>
              <input data-action="project-modal-name" type="text" value="${escapeHtml(name)}" placeholder="e.g. E-Commerce API" class="w-full px-4 py-2.5 border border-gray-200 dark:border-gray-700 dark:bg-gray-800 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label class="block text-xs font-semibold text-gray-500 uppercase mb-2">Description</label>
              <textarea data-action="project-modal-description" rows="3" placeholder="Optional project description" class="w-full px-4 py-2.5 border border-gray-200 dark:border-gray-700 dark:bg-gray-800 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none">${escapeHtml(description)}</textarea>
            </div>
            <div class="flex justify-end gap-3 pt-2">
              <button data-action="project-modal-close" class="px-4 py-2 text-sm rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800">Cancel</button>
              <button data-action="project-modal-submit" class="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium">${submitLabel}</button>
            </div>
          </div>
        </div>
      </div>`;
  }

  function openProjectModal(modal) {
    projectModal = modal;
    render();
  }

  function closeProjectModal() {
    projectModal = null;
    render();
  }

  function submitProjectModal() {
    if (!projectModal) return;
    const nameInput = document.querySelector('[data-action="project-modal-name"]');
    const descInput = document.querySelector('[data-action="project-modal-description"]');
    const name = nameInput?.value?.trim();
    const description = descInput?.value?.trim() ?? '';
    if (!name) {
      vscode.postMessage({ type: 'notify', message: 'Project name is required', level: 'error' });
      return;
    }
    if (projectModal.mode === 'create') {
      vscode.postMessage({ type: 'createProject', name, description });
    } else if (projectModal.mode === 'edit' && projectModal.id) {
      vscode.postMessage({ type: 'updateProject', projectId: projectModal.id, name, description });
    }
    closeProjectModal();
  }

  function renderCollectionModal() {
    if (!collectionModal) return '';
    const name = collectionModal.name ?? '';

    return `
      <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" data-action="collection-modal-backdrop">
        <div class="bg-white dark:bg-gray-900 rounded-xl shadow-xl w-full max-w-md mx-4 overflow-hidden border border-gray-200 dark:border-gray-700">
          <div class="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
            <div>
              <h2 class="text-lg font-bold">Edit Collection</h2>
              <p class="text-sm text-gray-500">Rename this collection</p>
            </div>
            <button data-action="collection-modal-close" class="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500">✕</button>
          </div>
          <div class="p-6 space-y-4">
            <div>
              <label class="block text-xs font-semibold text-gray-500 uppercase mb-2">Name *</label>
              <input data-action="collection-modal-name" type="text" value="${escapeHtml(name)}" placeholder="Collection name" class="w-full px-4 py-2.5 border border-gray-200 dark:border-gray-700 dark:bg-gray-800 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div class="flex justify-end gap-3 pt-2">
              <button data-action="collection-modal-close" class="px-4 py-2 text-sm rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800">Cancel</button>
              <button data-action="collection-modal-submit" class="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium">Save Changes</button>
            </div>
          </div>
        </div>
      </div>`;
  }

  function openCollectionModal(target) {
    collectionModal = target;
    render();
  }

  function closeCollectionModal() {
    collectionModal = null;
    render();
  }

  function submitCollectionModal() {
    if (!collectionModal) return;
    const nameInput = document.querySelector('[data-action="collection-modal-name"]');
    const name = nameInput?.value?.trim();
    if (!name) {
      vscode.postMessage({ type: 'notify', message: 'Collection name is required', level: 'error' });
      return;
    }
    vscode.postMessage({ type: 'updateCollection', collectionId: collectionModal.id, name });
    closeCollectionModal();
  }

  function renderDeleteCollectionModal() {
    if (!deleteCollectionModal) return '';
    const name = deleteCollectionModal.name ?? 'this collection';
    const folder = state?.folders?.find((f) => f.id === deleteCollectionModal.id);
    const requestCount = folder?.requests?.length ?? 0;

    return `
      <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" data-action="delete-collection-modal-backdrop">
        <div class="bg-white dark:bg-gray-900 rounded-xl shadow-xl w-full max-w-md mx-4 overflow-hidden border border-gray-200 dark:border-gray-700">
          <div class="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-xl bg-red-50 dark:bg-red-900/30 flex items-center justify-center text-red-500">⚠</div>
              <div>
                <h2 class="text-lg font-bold">Delete Collection</h2>
                <p class="text-sm text-gray-500">This action cannot be undone</p>
              </div>
            </div>
            <button data-action="delete-collection-modal-close" class="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500">✕</button>
          </div>
          <div class="p-6">
            <p class="text-sm text-gray-600 dark:text-gray-400">Are you sure you want to delete <strong>${escapeHtml(name)}</strong>${requestCount ? ` and its ${requestCount} request(s)` : ''}?</p>
          </div>
          <div class="flex justify-end gap-3 px-6 py-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50">
            <button data-action="delete-collection-modal-close" class="px-4 py-2 text-sm rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800">Cancel</button>
            <button data-action="delete-collection-modal-submit" class="px-4 py-2 text-sm bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium">Delete Collection</button>
          </div>
        </div>
      </div>`;
  }

  function openDeleteCollectionModal(target) {
    deleteCollectionModal = target;
    render();
  }

  function closeDeleteCollectionModal() {
    deleteCollectionModal = null;
    render();
  }

  function submitDeleteCollectionModal() {
    if (!deleteCollectionModal) return;
    const collectionId = deleteCollectionModal.id;
    clearTimeout(saveTimer);
    saveTimer = null;
    collectionDeletePending = true;

    const removedIds = new Set(
      state?.folders?.find((f) => f.id === collectionId)?.requests?.map((r) => r.id) ?? []
    );
    state.folders = (state.folders ?? []).filter((f) => f.id !== collectionId);
    state.openTabs = (state.openTabs ?? []).filter((id) => !removedIds.has(id));
    if (removedIds.has(state.activeTabId)) {
      state.activeTabId = state.openTabs[0] ?? '';
    }

    deleteCollectionModal = null;
    render();
    vscode.postMessage({ type: 'deleteCollection', collectionId });
  }

  function renderPageContent() {
    const nav =
      state.sidebarNav === 'projects'
        ? 'workspace'
        : state.sidebarNav;
    switch (nav) {
      case 'environments':
        return renderEnvironmentsPage();
      case 'collections':
        return renderCollectionsPage();
      case 'history':
        return renderHistoryPage();
      case 'git':
        return renderGitPage();
      case 'apidocs':
        return renderApiDocsPage();
      case 'settings':
        return renderSettingsPage();
      case 'about':
        return renderAboutPage();
      case 'workspace':
      default:
        return renderWorkspacePage();
    }
  }

  function renderEnvironmentsPage() {
    const selectedCount = getSelectedExportEnvironmentIds().length;
    const cards = state.environments
      .map((env) => {
        const isActive = env.id === state.activeEnvironmentId;
        const included = isEnvIncludedInExport(env);
        const vars = Object.entries(env.variables);
        const canDelete = true;
        const varRows =
          vars.length === 0
            ? '<p class="text-sm text-gray-400 py-2">No variables yet</p>'
            : vars
                .map(([key, value]) => {
                  const isSecret = /token|key|secret|password/i.test(key);
                  const revealKey = `${env.id}:${key}`;
                  const show = !isSecret || revealedVars[revealKey];
                  return `
            <div class="flex items-center gap-2 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg group">
              <span class="font-mono text-sm font-semibold text-blue-600 dark:text-blue-400 w-36 shrink-0 truncate" title="${escapeHtml(key)}">${escapeHtml(key)}</span>
              <input data-action="set-env-var" data-env-autocomplete="1" data-env-id="${env.id}" data-var-key="${escapeHtml(key)}" value="${escapeHtml(value)}" type="${show ? 'text' : 'password'}" class="kv-field-input flex-1 dark:text-gray-200" />
              <div class="flex gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                ${isSecret ? iconActionBtn(`data-action="toggle-reveal-var" data-env-id="${env.id}" data-var-key="${escapeHtml(key)}"`, 'view', show ? 'Hide value' : 'Show value', 'standalone icon-action-btn-lg') : ''}
                ${iconActionBtn(`data-action="copy-env-var" data-value="${escapeHtml(value)}"`, 'copy', 'Copy value', 'standalone icon-action-btn-lg')}
                ${iconActionBtn(`data-action="edit-env-var" data-env-id="${env.id}" data-var-key="${escapeHtml(key)}" data-var-value="${escapeHtml(value)}"`, 'edit', 'Edit variable', 'standalone icon-action-btn-lg')}
                ${iconActionBtn(`data-action="delete-env-var" data-env-id="${env.id}" data-var-key="${escapeHtml(key)}"`, 'delete', 'Delete variable', 'standalone icon-action-btn-lg danger')}
              </div>
            </div>`;
                })
                .join('');

        return `
        <div class="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-5 ${isActive ? 'ring-2 ring-blue-500' : ''} ${!included ? 'opacity-80' : ''}">
          <div class="flex items-center justify-between mb-4 gap-2">
            <div class="flex items-center gap-3 min-w-0">
              <label class="flex items-center shrink-0 cursor-pointer" title="${t('environments.exportInclude')}">
                <input type="checkbox" data-action="toggle-env-export" data-env-id="${env.id}" ${included ? 'checked' : ''} class="rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
              </label>
              ${envDotHtml(env.color)}
              <button type="button" data-action="select-env" data-env-id="${env.id}" class="font-semibold text-lg truncate text-left hover:text-blue-600 dark:hover:text-blue-400 ${isActive ? 'text-blue-700 dark:text-blue-300' : ''}" title="${isActive ? t('common.selected') : t('common.select')}">${escapeHtml(env.name)}</button>
              ${isActive ? '<span class="px-2 py-0.5 text-xs font-medium bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300 rounded shrink-0">' + t('common.active') + '</span>' : ''}
              ${!included ? '<span class="px-2 py-0.5 text-xs font-medium bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400 rounded shrink-0">' + t('environments.excluded') + '</span>' : ''}
            </div>
            <div class="flex items-center gap-1 shrink-0 flex-wrap justify-end">
              ${iconActionGroup(
                iconActionBtn(
                  `data-action="duplicate-env" data-env-id="${env.id}" data-env-name="${escapeHtml(env.name)}" data-env-color="${escapeHtml(env.color)}"`,
                  'duplicate',
                  'Duplicate'
                ) +
                iconActionBtn(
                  `data-action="edit-env" data-env-id="${env.id}" data-env-name="${escapeHtml(env.name)}" data-env-color="${escapeHtml(env.color)}"`,
                  'edit',
                  'Edit environment'
                ) +
                (canDelete
                  ? iconActionBtn(
                      `data-action="delete-env" data-env-id="${env.id}" data-env-name="${escapeHtml(env.name)}"`,
                      'delete',
                      'Delete environment'
                    )
                  : '')
              )}
              ${iconActionBtn(`data-action="copy-env-all" data-env-id="${env.id}"`, 'copy', 'Copy all variables', 'standalone ml-1')}
            </div>
          </div>
          <div class="space-y-2 min-h-[60px]">${varRows}</div>
          <div class="flex items-center gap-2 mt-4 pt-3 border-t border-gray-100 dark:border-gray-800">
            <input data-action="new-env-var-key" data-env-id="${env.id}" placeholder="BASE_URL" pattern="[A-Z][A-Z0-9_]*" title="Uppercase letters, numbers, and underscores only" class="w-36 shrink-0 px-2 py-1.5 text-sm font-mono uppercase border border-gray-200 dark:border-gray-700 dark:bg-gray-800 rounded-lg" />
            <input data-action="new-env-var-value" data-env-id="${env.id}" data-env-autocomplete="1" placeholder="Value" class="flex-1 px-2 py-1.5 text-sm font-mono border border-gray-200 dark:border-gray-700 dark:bg-gray-800 rounded-lg" />
            <button data-action="commit-env-var" data-env-id="${env.id}" class="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 shrink-0">Add</button>
          </div>
        </div>`;
      })
      .join('');

    return `
      <div class="flex-1 overflow-y-auto p-6 bg-gray-50 dark:bg-gray-950 relative">
        <div class=" mx-auto">
          <div class="flex flex-wrap items-center justify-between gap-4 mb-6">
            <div>
              <h1 class="page-title">Environments</h1>
              <p class="text-sm text-gray-500 mt-1">${escapeHtml(state.projectName)} — ${t('environments.exportHint')}</p>
              <p class="text-xs text-gray-400 mt-1">${t('environments.selectedCount', { count: selectedCount, total: state.environments.length })}</p>
            </div>
            <div class="flex flex-wrap items-center gap-2">
              <button data-action="import-environments" class="px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800">Import</button>
              <button data-action="export-environments" class="px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50" ${selectedCount === 0 ? 'disabled title="Select at least one environment"' : ''}>${t('environments.exportSelected')}</button>
              <button data-action="new-environment" class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg">+ New Environment</button>
            </div>
          </div>
          ${state.environments.length === 0 ? '<div class="text-center py-16 text-gray-400"><p>No environments yet. Create your first environment to get started.</p></div>' : `<div class="grid grid-cols-1 xl:grid-cols-2 gap-6">${cards}</div>`}
        </div>
        ${renderEnvironmentModal()}
        ${renderDeleteEnvironmentModal()}
      </div>`;
  }

  function renderHistoryPage() {
    const rows =
      state.history.length === 0
        ? '<div class="text-center py-16 text-gray-400"><p class="text-lg mb-2">No request history yet</p><p class="text-sm">Send a request from the workspace to see it here</p></div>'
        : `<div class="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
            <table class="w-full text-sm">
              <thead class="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                <tr>
                  <th class="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Method</th>
                  <th class="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">URL</th>
                  <th class="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Status</th>
                  <th class="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Time</th>
                  <th class="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Size</th>
                  <th class="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">When</th>
                </tr>
              </thead>
              <tbody>
                ${state.history
                  .map(
                    (h) => `
                  <tr class="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer" data-action="history-row" data-history-id="${h.id}">
                    <td class="px-4 py-3"><span class="font-bold text-xs ${METHOD_COLORS[h.method] || ''}">${h.method}</span></td>
                    <td class="px-4 py-3 font-mono text-xs truncate max-w-md" title="${escapeHtml(h.url)}">${escapeHtml(h.url)}</td>
                    <td class="px-4 py-3"><span class="${statusClass(h.status)} font-medium">${h.status}</span></td>
                    <td class="px-4 py-3 text-gray-500">${h.durationMs} ms</td>
                    <td class="px-4 py-3 text-gray-500">${formatBytes(h.sizeBytes)}</td>
                    <td class="px-4 py-3 text-gray-400">${timeAgo(h.timestamp)}</td>
                  </tr>`
                  )
                  .join('')}
              </tbody>
            </table>
          </div>`;

    return `
      <div class="flex-1 overflow-y-auto p-6 bg-gray-50 dark:bg-gray-950">
        <div class=" mx-auto">
          <div class="flex items-center justify-between mb-6">
            <div>
              <h1 class="page-title">${t('nav.history')}</h1>
              <p class="text-sm text-gray-500 mt-1">${state.history.length} request(s) recorded</p>
            </div>
            ${state.history.length > 0 ? '<button data-action="clear-history" class="px-4 py-2 text-sm text-red-600 border border-red-200 hover:bg-red-50 dark:border-red-800 dark:hover:bg-red-900/20 rounded-lg">Clear History</button>' : ''}
          </div>
          ${rows}
        </div>
      </div>`;
  }

  function renderCollectionsPage() {
    const cols = state.folders
      .map(
        (folder) => {
          const proto = normalizeProtocol(folder.protocol);
          const expanded = folder.expanded !== false;
          return `
      <div class="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-5 mb-4" data-collection-id="${folder.id}">
        <div class="flex items-center justify-between gap-3">
          <button data-action="toggle-folder" data-folder-id="${folder.id}" class="flex items-center gap-2 min-w-0 text-left hover:opacity-80">
            <svg class="w-4 h-4 text-gray-400 shrink-0 transition-transform ${expanded ? 'rotate-90' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg>
            <h3 class="font-semibold text-lg truncate">📁 ${escapeHtml(folder.name)}</h3>
            <span class="text-xs px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 shrink-0 inline-flex items-center gap-1">${protocolIcon(proto, 'protocol-icon-inline')} ${protocolLabel(proto)}</span>
          </button>
          <div class="flex items-center gap-2 shrink-0 flex-wrap justify-end">
            <span class="text-xs text-gray-400">${folder.requests.length} request(s)</span>
            ${iconActionGroup(
              iconActionBtn(
                `data-action="edit-collection" data-collection-id="${folder.id}" data-collection-name="${escapeHtml(folder.name)}"`,
                'edit',
                'Edit collection'
              ) +
              iconActionBtn(
                `data-action="delete-collection" data-collection-id="${folder.id}" data-collection-name="${escapeHtml(folder.name)}"`,
                'delete',
                'Delete collection'
              )
            )}
            ${iconActionBtn(
              `data-action="open-export-modal" data-export-scope="collection" data-collection-id="${folder.id}" data-collection-name="${escapeHtml(folder.name)}"`,
              'export',
              'Export collection',
              'standalone'
            )}
            ${iconActionBtn(
              `data-action="new-request-in-collection" data-collection-id="${folder.id}" data-protocol="${proto}"`,
              'plus',
              'New request',
              'standalone primary'
            )}
          </div>
        </div>
        ${expanded ? `<div class="space-y-1 mt-3 pt-3 border-t border-gray-100 dark:border-gray-800">
          ${folder.requests.map((r) => {
            const rp = getRequestProtocol(r);
            return `
            <div class="explorer-request-row group flex items-center gap-1 w-full px-1 rounded" data-action="open-request" data-request-id="${r.id}">
              <div class="flex-1 flex items-center gap-2 min-w-0 px-2 py-2 text-sm min-w-0">
                <button data-action="open-request" data-request-id="${r.id}" class="shrink-0" type="button" title="Open request">
                  <span class="explorer-method-badge explorer-method-badge-wide ${METHOD_COLORS[r.method] || ''}">${explorerMethodLabel(r)}</span>
                </button>
                ${renderInlineRequestTitle(r, 'flex-1 min-w-0 truncate font-medium text-[0.92em]')}
                <span class="text-[10px] text-gray-400 shrink-0 inline-flex items-center">${protocolIcon(rp, 'protocol-icon-inline')}</span>
                <span class="ml-auto font-mono text-xs text-gray-400 truncate max-w-xs">${escapeHtml(r.url)}</span>
              </div>
              <div class="flex items-center gap-0.5 mr-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                ${iconActionBtn(
                  `data-action="delete-request" data-request-id="${r.id}" data-request-name="${escapeHtml(r.name)}" data-collection-name="${escapeHtml(folder.name)}"`,
                  'delete',
                  'Delete request',
                  'inline danger icon-only'
                )}
              </div>
            </div>`;
          }).join('') || '<p class="text-sm text-gray-400 px-3">No requests — click + Request to add one</p>'}
        </div>` : ''}
      </div>`;
        }
      )
      .join('');

    return `
      <div class="flex-1 overflow-y-auto p-6 bg-gray-50 dark:bg-gray-950">
        <div class=" mx-auto">
          <div class="flex items-center justify-between mb-6">
            <div>
              <h1 class="page-title">Collections</h1>
              <p class="text-sm text-gray-500 mt-1">${state.folders.length} collection(s) — HTTP, GraphQL, WebSocket & more</p>
            </div>
            <div class="flex gap-2">
              <button data-action="open-import-modal" class="px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800">Import</button>
              <button data-action="open-export-modal" data-export-scope="project" class="px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800">Export</button>
            </div>
          </div>
          <div class="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-5 mb-6">
            <h2 class="font-semibold mb-3">Create Collection</h2>
            <div class="flex flex-wrap gap-2 items-end">
              <div class="flex-1 min-w-[180px]">
                <label class="block text-xs text-gray-500 mb-1">Name</label>
                <input data-action="new-collection-name" type="text" placeholder="My API Collection" class="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 dark:bg-gray-800 rounded-lg" />
              </div>
              <div class="w-52">
                <label class="block text-xs text-gray-500 mb-1">Protocol</label>
                ${renderProtocolPicker()}
              </div>
              <button data-action="create-collection" class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg">+ Create Collection</button>
            </div>
          </div>
          ${cols || '<div class="text-center py-16 text-gray-400">No collections yet — create one above</div>'}
        </div>
        ${renderExportModal()}
        ${renderImportModal()}
        ${renderCollectionModal()}
        ${renderDeleteCollectionModal()}
      </div>`;
  }

  function buildGitCommitMessage() {
    const subject = gitCommitSubject.trim();
    const body = gitCommitBody.trim();
    if (!subject && body) return body;
    if (!body) return subject;
    return `${subject}\n\n${body}`;
  }

  function canGitCommit() {
    const hasMessage = buildGitCommitMessage().trim().length > 0;
    const stagedCount = gitStatus?.stagedFiles?.length ?? 0;
    return hasMessage && (stagedCount > 0 || gitAmendCommit);
  }

  function triggerGitCommit() {
    if (!canGitCommit()) return;
    const payload = {
      message: buildGitCommitMessage(),
      amend: gitAmendCommit ? '1' : '0',
    };
    vscode.postMessage({ type: 'gitAction', action: 'commit', payload });
    setTimeout(() => vscode.postMessage({ type: 'loadGitStatus' }), 800);
  }

  function sortGitFiles(files, sortBy) {
    const list = [...files];
    if (sortBy === 'status') {
      list.sort((a, b) => {
        const order = { untracked: 0, added: 1, modified: 2, deleted: 3, renamed: 4, copied: 5 };
        const diff = (order[a.status] ?? 9) - (order[b.status] ?? 9);
        return diff !== 0 ? diff : a.path.localeCompare(b.path);
      });
    } else {
      list.sort((a, b) => a.path.localeCompare(b.path));
    }
    return list;
  }

  function gitFileExtIcon(path) {
    const ext = path.split('.').pop()?.toLowerCase() ?? '';
    const map = {
      ts: 'TS',
      tsx: 'TX',
      js: 'JS',
      jsx: 'JX',
      json: '{}',
      md: 'MD',
      yaml: 'YM',
      yml: 'YM',
      html: 'HT',
      css: 'CS',
    };
    return map[ext] ?? '··';
  }

  function formatGitRefs(refs) {
    if (!refs) return '';
    return refs
      .replace(/^\(|\)$/g, '')
      .split(',')
      .map((r) => r.trim())
      .filter(Boolean)
      .map((r) => `<span class="git-ref-tag">${escapeHtml(r)}</span>`)
      .join('');
  }

  function getAllChangedFiles() {
    const staged = gitStatus?.stagedFiles ?? [];
    const unstaged = gitStatus?.unstagedFiles ?? [];
    const seen = new Set();
    const all = [];
    for (const f of [...staged, ...unstaged]) {
      if (!seen.has(f.path)) {
        seen.add(f.path);
        const isStaged = staged.some((s) => s.path === f.path);
        all.push({ path: f.path, staged: isStaged, status: f.status });
      }
    }
    return sortGitFiles(all, gitFileSort);
  }

  function gitStatusLabel(status) {
    const map = {
      modified: 'M',
      added: 'A',
      deleted: 'D',
      renamed: 'R',
      copied: 'C',
      untracked: 'U',
    };
    return map[status] ?? '?';
  }

  function gitStatusClass(status) {
    if (status === 'added' || status === 'untracked') return 'git-file-badge git-file-badge-added';
    if (status === 'deleted') return 'git-file-badge git-file-badge-deleted';
    return 'git-file-badge git-file-badge-modified';
  }

  function parseUnifiedDiff(text) {
    const rows = [];
    let oldLine = 0;
    let newLine = 0;
    const lines = String(text ?? '').split('\n');
    for (const line of lines) {
      if (line.startsWith('@@')) {
        const m = line.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
        if (m) {
          oldLine = parseInt(m[1], 10);
          newLine = parseInt(m[2], 10);
        }
        rows.push({ type: 'hunk', old: line, new: line, oldNum: null, newNum: null });
        continue;
      }
      if (line.startsWith('---') || line.startsWith('+++') || line.startsWith('diff ')) continue;
      if (line.startsWith('+')) {
        rows.push({ type: 'add', old: '', new: line.slice(1), oldNum: null, newNum: newLine++ });
      } else if (line.startsWith('-')) {
        rows.push({ type: 'del', old: line.slice(1), new: '', oldNum: oldLine++, newNum: null });
      } else {
        const content = line.startsWith(' ') ? line.slice(1) : line;
        rows.push({ type: 'ctx', old: content, new: content, oldNum: oldLine++, newNum: newLine++ });
      }
    }
    return rows;
  }

  function renderGitFileRow(file, staged) {
    const selected = gitSelectedFile === file.path && gitSelectedStaged === staged;
    const icon = gitFileExtIcon(file.path);
    return `
      <div class="git-file-row ${selected ? 'git-file-row-selected' : ''}">
        <label class="git-file-check" title="${staged ? 'Unstage' : 'Stage'}">
          <input type="checkbox" data-action="git-toggle-stage" data-file-path="${escapeHtml(file.path)}" data-staged="${staged ? '1' : '0'}" ${staged ? 'checked' : ''} />
        </label>
        <span class="git-file-icon font-mono">${escapeHtml(icon)}</span>
        <span class="${gitStatusClass(file.status)}">${gitStatusLabel(file.status)}</span>
        <span class="git-file-path font-mono" data-action="git-select-file" data-file-path="${escapeHtml(file.path)}" data-staged="${staged ? '1' : '0'}">${escapeHtml(file.path)}</span>
      </div>`;
  }

  function renderGitDiffTabs() {
    const files = getAllChangedFiles();
    if (!files.length) return '';
    return `
      <div class="git-diff-tabs">
        ${files
          .map((f) => {
            const active = gitSelectedFile === f.path;
            const shortName = f.path.split('/').pop() ?? f.path;
            return `
            <button type="button" class="git-diff-tab ${active ? 'git-diff-tab-active' : ''}" data-action="git-select-file" data-file-path="${escapeHtml(f.path)}" data-staged="${f.staged ? '1' : '0'}">
              ${escapeHtml(shortName)}
            </button>`;
          })
          .join('')}
      </div>`;
  }

  function renderGitDiffPanel() {
    const diffTabs = renderGitDiffTabs();
    const viewToggle = `
      <div class="git-diff-controls">
        <label class="git-diff-toggle">
          <input type="checkbox" data-action="git-side-by-side-toggle" ${gitSideBySideDiff ? 'checked' : ''} />
          Side-by-side diff
        </label>
        <span class="git-diff-staged-label">${gitSelectedStaged ? 'Staged' : 'Unstaged'}</span>
      </div>`;

    if (!gitSelectedFile) {
      return `
        ${diffTabs}
        ${viewToggle}
        <div class="git-diff-empty">
          <p>Select a changed file to view its diff</p>
        </div>`;
    }
    const rows = parseUnifiedDiff(gitDiffContent);
    if (!rows.length) {
      return `
        ${diffTabs}
        ${viewToggle}
        <div class="git-diff-empty">
          <p class="font-mono text-sm">${escapeHtml(gitSelectedFile)}</p>
          <p class="git-empty-hint mt-2">No diff available (binary or empty change)</p>
        </div>`;
    }

    let diffBody;
    if (gitSideBySideDiff) {
      const diffRows = rows
        .map((row) => {
          if (row.type === 'hunk') {
            return `<div class="git-diff-hunk font-mono">${escapeHtml(row.old)}</div>`;
          }
          const oldClass = row.type === 'add' ? 'git-diff-gap' : row.type === 'del' ? 'git-diff-del' : 'git-diff-ctx';
          const newClass = row.type === 'del' ? 'git-diff-gap' : row.type === 'add' ? 'git-diff-add' : 'git-diff-ctx';
          return `
            <div class="git-diff-line">
              <div class="git-diff-side git-diff-old ${oldClass} font-mono">
                <span class="git-diff-ln">${row.oldNum ?? ''}</span>
                <span class="git-diff-text">${escapeHtml(row.old)}</span>
              </div>
              <div class="git-diff-side git-diff-new ${newClass} font-mono">
                <span class="git-diff-ln">${row.newNum ?? ''}</span>
                <span class="git-diff-text">${escapeHtml(row.new)}</span>
              </div>
            </div>`;
        })
        .join('');
      diffBody = `<div class="git-diff-body">${diffRows}</div>`;
    } else {
      const unifiedRows = rows
        .map((row) => {
          if (row.type === 'hunk') {
            return `<div class="git-diff-hunk font-mono">${escapeHtml(row.old)}</div>`;
          }
          const cls =
            row.type === 'add' ? 'git-diff-unified-add' : row.type === 'del' ? 'git-diff-unified-del' : 'git-diff-unified-ctx';
          const prefix = row.type === 'add' ? '+' : row.type === 'del' ? '-' : ' ';
          const lineNum = row.type === 'add' ? row.newNum : row.oldNum;
          const text = row.type === 'add' ? row.new : row.type === 'del' ? row.old : row.old;
          return `
            <div class="git-diff-unified-line ${cls} font-mono">
              <span class="git-diff-ln">${lineNum ?? ''}</span>
              <span class="git-diff-prefix">${prefix}</span>
              <span class="git-diff-text">${escapeHtml(text)}</span>
            </div>`;
        })
        .join('');
      diffBody = `<div class="git-diff-body git-diff-unified">${unifiedRows}</div>`;
    }

    return `
      ${diffTabs}
      ${viewToggle}
      <div class="git-diff-header font-mono">
        <span>${escapeHtml(gitSelectedFile)}</span>
      </div>
      ${diffBody}`;
  }

  function renderGitCommitDetail() {
    const commits = gitStatus?.commits ?? [];
    const selectedHash = gitSelectedCommitHash ?? commits[0]?.hash ?? null;
    const selected = commits.find((c) => c.hash === selectedHash) ?? null;
    if (!selected) {
      return '<div class="git-commit-detail git-commit-detail-empty"><p>Select a commit</p></div>';
    }
    const initials = selected.author
      .split(/\s+/)
      .map((w) => w[0])
      .join('')
      .slice(0, 2)
      .toUpperCase();
    const messageLines = selected.message.split('\n');
    const subject = messageLines[0] ?? '';
    const body = messageLines.slice(1).join('\n').trim();
    return `
      <div class="git-commit-detail">
        <div class="git-commit-detail-header">
          <div class="git-commit-avatar">${escapeHtml(initials)}</div>
          <div>
            <div class="git-commit-detail-author">${escapeHtml(selected.author)}</div>
            <div class="git-commit-detail-date">${escapeHtml(selected.date)}</div>
          </div>
        </div>
        <div class="git-commit-detail-subject">${escapeHtml(subject)}</div>
        ${body ? `<div class="git-commit-detail-body font-mono">${escapeHtml(body)}</div>` : ''}
        <div class="git-commit-detail-hash font-mono">${escapeHtml(selected.hash)}</div>
      </div>`;
  }

  function renderGitHistoryTable() {
    const commits = gitStatus?.commits ?? [];
    const search = gitLogSearch.trim().toLowerCase();
    const filtered = search
      ? commits.filter(
          (c) =>
            c.message.toLowerCase().includes(search) ||
            c.author.toLowerCase().includes(search) ||
            c.shortHash.toLowerCase().includes(search) ||
            (c.refs ?? '').toLowerCase().includes(search)
        )
      : commits;

    if (!filtered.length) {
      return '<p class="git-empty-hint p-4">No commits found.</p>';
    }

    const rows = filtered
      .map((c) => {
        const selected = gitSelectedCommitHash === c.hash;
        const refsHtml = formatGitRefs(c.refs);
        return `
        <tr class="git-log-row ${selected ? 'git-log-row-selected' : ''}" data-action="git-select-commit" data-commit-hash="${escapeHtml(c.hash)}">
          <td class="git-log-graph font-mono">${escapeHtml(c.graph ?? '·')}</td>
          <td class="git-log-message">
            <span>${escapeHtml(c.message.split('\n')[0])}</span>
            ${refsHtml ? `<span class="git-log-refs">${refsHtml}</span>` : ''}
          </td>
          <td class="font-mono text-xs git-log-hash">${escapeHtml(c.shortHash)}</td>
          <td class="git-log-author">${escapeHtml(c.author)}</td>
          <td class="git-log-date">${escapeHtml(c.date)}</td>
        </tr>`;
      })
      .join('');

    return `
      <table class="git-log-table w-full">
        <thead>
          <tr>
            <th class="git-log-th-graph">Graph</th>
            <th>Description</th>
            <th>Commit</th>
            <th>Author</th>
            <th>Date</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>`;
  }

  function renderGitBottomPanel() {
    const tab = gitBottomTab;
    let content = '';
    if (tab === 'log' || tab === 'search') {
      content = `
        <div class="git-bottom-split">
          <div class="git-log-body">${renderGitHistoryTable()}</div>
          ${renderGitCommitDetail()}
        </div>`;
    } else {
      const staged = sortGitFiles(gitStatus?.stagedFiles ?? [], gitFileSort);
      const unstaged = sortGitFiles(gitStatus?.unstagedFiles ?? [], gitFileSort);
      content = `
        <div class="git-status-summary p-4">
          <p class="git-empty-hint mb-3">${staged.length} staged · ${unstaged.length} unstaged · branch <strong>${escapeHtml(gitStatus?.branch ?? 'main')}</strong></p>
          <div class="grid grid-cols-2 gap-4">
            <div>
              <div class="git-section-header">Staged</div>
              ${staged.length ? staged.map((f) => `<div class="git-file-path font-mono text-xs py-1">${escapeHtml(f.path)}</div>`).join('') : '<p class="git-empty-hint">None</p>'}
            </div>
            <div>
              <div class="git-section-header">Unstaged</div>
              ${unstaged.length ? unstaged.map((f) => `<div class="git-file-path font-mono text-xs py-1">${escapeHtml(f.path)}</div>`).join('') : '<p class="git-empty-hint">None</p>'}
            </div>
          </div>
        </div>`;
    }

    return `
      <div class="git-log-panel">
        <div class="git-bottom-tabs">
          <button type="button" class="git-bottom-tab ${tab === 'status' ? 'git-bottom-tab-active' : ''}" data-action="git-bottom-tab" data-tab="status">File Status</button>
          <button type="button" class="git-bottom-tab ${tab === 'log' ? 'git-bottom-tab-active' : ''}" data-action="git-bottom-tab" data-tab="log">Log / History</button>
          <button type="button" class="git-bottom-tab ${tab === 'search' ? 'git-bottom-tab-active' : ''}" data-action="git-bottom-tab" data-tab="search">Search</button>
          ${tab === 'search' ? `<input type="search" data-action="git-log-search" value="${escapeHtml(gitLogSearch)}" placeholder="Search commits…" class="git-log-search-input" />` : ''}
        </div>
        ${content}
      </div>`;
  }

  function renderGitSetupPanel() {
    const ready = gitStatus?.isRepo;
    return `
      <div class="git-setup-panel">
        <div class="flex flex-wrap gap-2 mb-4">
          <button data-action="git-action" data-git-action="init" class="px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800">Init Repo</button>
          <button data-action="git-action" data-git-action="chooseRepo" class="px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800">Choose Folder</button>
          ${ready ? `<button data-action="git-action" data-git-action="openFolder" class="px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800">Open Folder</button>` : ''}
        </div>
        <div class="space-y-3">
          <div>
            <label class="text-xs font-semibold text-gray-500 uppercase">Remote URL</label>
            <input data-action="git-remote-input" value="${escapeHtml(gitRemoteInput || gitStatus?.remoteUrl || '')}" placeholder="https://github.com/org/repo.git" class="w-full px-3 py-2 text-sm font-mono border border-gray-200 dark:border-gray-700 dark:bg-gray-800 rounded-lg mt-1" />
            <button data-action="git-action" data-git-action="setRemote" class="mt-2 px-3 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700">Save Remote</button>
          </div>
          <div>
            <label class="text-xs font-semibold text-gray-500 uppercase">Clone from remote</label>
            <input data-action="git-clone-input" value="${escapeHtml(gitCloneUrl)}" placeholder="https://github.com/org/collections.git" class="w-full px-3 py-2 text-sm font-mono border border-gray-200 dark:border-gray-700 dark:bg-gray-800 rounded-lg mt-1" />
            <button data-action="git-action" data-git-action="clone" class="mt-2 px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800">Clone</button>
          </div>
        </div>
      </div>`;
  }

  function renderGitPage() {
    const ready = gitStatus?.isRepo;
    const stagedFiles = sortGitFiles(gitStatus?.stagedFiles ?? [], gitFileSort);
    const unstagedFiles = sortGitFiles(gitStatus?.unstagedFiles ?? [], gitFileSort);
    const ahead = gitStatus?.ahead ?? 0;
    const behind = gitStatus?.behind ?? 0;
    const syncLabel = ahead || behind ? `↑${ahead} ↓${behind}` : '';

    if (!ready) {
      return `
        <div class="flex-1 overflow-y-auto p-6 bg-gray-50 dark:bg-gray-950">
          <div class="mx-auto">
            <div class="mb-6">
              <h1 class="page-title">Git Sync</h1>
              <p class="text-sm text-gray-500 mt-1">${escapeHtml(state.projectName)} — sync collections & environments to a Git repository</p>
            </div>
            <div class="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-6">
              <h2 class="mb-2">Set up a repository</h2>
              <p class="text-sm text-gray-500 mb-4">Initialize a local repo, choose an existing folder, or clone from a remote URL.</p>
              ${renderGitSetupPanel()}
            </div>
          </div>
        </div>`;
    }

    return `
      <div class="git-page flex-1 flex flex-col min-h-0">
        <div class="git-toolbar">
          <div class="git-toolbar-left">
            <h1 class="page-title git-page-title">Git Sync</h1>
            <span class="git-branch-badge font-mono">${escapeHtml(gitStatus.branch ?? 'main')}</span>
            ${syncLabel ? `<span class="git-sync-count font-mono">${syncLabel}</span>` : ''}
            ${gitStatus.hasChanges ? '<span class="git-changes-dot" title="Uncommitted changes"></span>' : ''}
          </div>
          <div class="git-toolbar-actions">
            <button data-action="git-action" data-git-action="sync" class="git-btn git-btn-primary">↻ Sync to Git</button>
            <button data-action="git-action" data-git-action="importFromRepo" class="git-btn">Import</button>
            <button data-action="git-action" data-git-action="pull" class="git-btn">Pull</button>
            <button data-action="git-action" data-git-action="push" class="git-btn">Push</button>
            <button data-action="git-refresh" class="git-btn" title="Refresh">↻</button>
            <button type="button" data-action="git-toggle-setup" class="git-btn" title="Repository settings">⚙</button>
          </div>
        </div>

        ${gitShowSetup ? `<div class="git-setup-bar">${renderGitSetupPanel()}</div>` : ''}

        <div class="git-workspace">
          <aside class="git-sidebar">
            <div class="git-sidebar-toolbar">
              <select data-action="git-file-sort" class="git-sort-select" title="Sort pending files">
                <option value="path" ${gitFileSort === 'path' ? 'selected' : ''}>Pending files, sorted by path</option>
                <option value="status" ${gitFileSort === 'status' ? 'selected' : ''}>Pending files, sorted by status</option>
              </select>
            </div>

            <div class="git-sidebar-section">
              <div class="git-section-header">
                <span>Staged files (${stagedFiles.length})</span>
                <div class="git-section-actions">
                  <button type="button" data-action="git-action" data-git-action="unstageAll" class="git-link-btn" title="Unstage all">− all</button>
                </div>
              </div>
              <div class="git-file-list">
                ${stagedFiles.length ? stagedFiles.map((f) => renderGitFileRow(f, true)).join('') : '<p class="git-empty-hint">No staged changes</p>'}
              </div>
            </div>

            <div class="git-sidebar-section">
              <div class="git-section-header">
                <span>Unstaged files (${unstagedFiles.length})</span>
                <div class="git-section-actions">
                  <button type="button" data-action="git-action" data-git-action="stageAll" class="git-link-btn" title="Stage all">+ all</button>
                </div>
              </div>
              <div class="git-file-list">
                ${unstagedFiles.length ? unstagedFiles.map((f) => renderGitFileRow(f, false)).join('') : '<p class="git-empty-hint">No unstaged changes</p>'}
              </div>
            </div>

            <div class="git-commit-box">
              <input data-action="git-commit-subject" type="text" placeholder="Commit subject" value="${escapeHtml(gitCommitSubject)}" class="git-commit-subject font-mono" />
              <textarea data-action="git-commit-body" rows="3" placeholder="Description (optional)" class="git-commit-textarea font-mono">${escapeHtml(gitCommitBody)}</textarea>
              <label class="git-amend-label">
                <input type="checkbox" data-action="git-amend-toggle" ${gitAmendCommit ? 'checked' : ''} />
                Amend last commit
              </label>
              <button data-action="git-commit-submit" class="git-btn git-btn-primary git-commit-btn" ${canGitCommit() ? '' : 'disabled'}>
                Commit
                <span class="git-kbd">⌘↵</span>
              </button>
            </div>
          </aside>

          <main class="git-diff-panel">
            ${renderGitDiffPanel()}
          </main>
        </div>

        ${renderGitBottomPanel()}
      </div>`;
  }

  function renderApiDocsPage() {
    const totalRequests = state.folders.reduce((n, f) => n + f.requests.length, 0);
    const repoReady = gitStatus?.isRepo;
    return `
      <div class="flex-1 overflow-y-auto p-6 bg-gray-50 dark:bg-gray-950">
        <div class=" mx-auto">
          <div class="mb-6">
            <h1 class="page-title">API Documentation</h1>
            <p class="text-sm text-gray-500 mt-1">Generate beautiful static docs from your API collections</p>
          </div>

          <div class="grid md:grid-cols-3 gap-4 mb-8">
            <div class="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-5">
              <div class="text-3xl font-bold">${state.folders.length}</div>
              <div class="text-sm text-gray-500 mt-1">Collections</div>
            </div>
            <div class="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-5">
              <div class="text-3xl font-bold">${totalRequests}</div>
              <div class="text-sm text-gray-500 mt-1">Endpoints</div>
            </div>
            <div class="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-5">
              <div class="text-3xl font-bold ${repoReady ? 'text-green-600' : 'text-gray-400'}">${repoReady ? '✓' : '—'}</div>
              <div class="text-sm text-gray-500 mt-1">Git repo linked</div>
            </div>
          </div>

          <div class="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-6 space-y-4">
            <h2 class="font-semibold text-lg">Publish & Preview</h2>
            <p class="text-sm text-gray-500">Docs are generated as OpenAPI 3.0 + static HTML. Publish to your Git repo for GitHub Pages, or preview locally.</p>
            <div class="flex flex-wrap gap-3">
              <button data-action="git-action" data-git-action="previewDocs" class="px-4 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 font-medium">👁 Preview Docs</button>
              <button data-action="git-action" data-git-action="publishDocs" class="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium" ${repoReady ? '' : 'title="Link a Git repo first"'}>📖 Publish to Git</button>
              <button data-action="sidebar-nav" data-nav="git" class="px-3 py-2 text-sm text-blue-600 hover:underline">Git Settings →</button>
            </div>
            ${!repoReady ? '<p class="text-xs text-amber-600">Link a Git repository on the Git Sync page to publish docs to <code>docs/index.html</code>.</p>' : ''}
          </div>
        </div>
      </div>`;
  }

  function renderExportModal() {
    if (!exportModal) return '';
    const formats = EXPORT_FORMATS.map(
      (fmt) => `
      <label class="flex items-start gap-3 p-3 border rounded-lg cursor-pointer ${exportModal.format === fmt.id ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' : 'border-gray-200 dark:border-gray-700'}">
        <input type="radio" name="export-format" data-action="export-format-pick" data-format="${fmt.id}" ${exportModal.format === fmt.id ? 'checked' : ''} class="mt-1" />
        <div><div class="font-medium text-sm">${escapeHtml(fmt.name)}</div><div class="text-xs text-gray-500">${escapeHtml(fmt.desc)}</div></div>
      </label>`
    ).join('');

    const scopeLabel = exportModal.collectionId
      ? `Export only <strong>${escapeHtml(exportModal.collectionName || 'this collection')}</strong>`
      : `Export all collections from ${escapeHtml(state.projectName)}`;

    return `
      <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/40" data-action="export-modal-backdrop">
        <div class="bg-white dark:bg-gray-900 rounded-xl shadow-xl w-full max-w-md mx-4 p-6" data-action="export-modal-panel">
          <h2 class="text-lg font-bold mb-1">${exportModal.collectionId ? 'Export Collection' : 'Export Project'}</h2>
          <p class="text-sm text-gray-500 mb-4">${scopeLabel}</p>
          <div class="space-y-2 mb-4 max-h-64 overflow-y-auto">${formats}</div>
          <label class="flex items-center gap-2 text-sm mb-4">
            <input type="checkbox" data-action="export-modal-include-env" ${exportModal.includeEnvironments !== false ? 'checked' : ''} />
            Include selected environments (${getSelectedExportEnvironmentIds().length})
          </label>
          <div class="flex justify-end gap-2">
            <button data-action="export-modal-close" class="px-4 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg">Cancel</button>
            <button data-action="export-modal-submit" class="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700">Export</button>
          </div>
        </div>
      </div>`;
  }

  function renderImportModal() {
    if (!importModal) return '';
    const formats = IMPORT_FORMATS.map(
      (fmt) => `
      <label class="flex items-start gap-3 p-3 border rounded-lg cursor-pointer ${importModal.format === fmt.id ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' : 'border-gray-200 dark:border-gray-700'}">
        <input type="radio" name="import-format" data-action="import-format-pick" data-format="${fmt.id}" ${importModal.format === fmt.id ? 'checked' : ''} class="mt-1" />
        <div><div class="font-medium text-sm">${escapeHtml(fmt.name)}</div><div class="text-xs text-gray-500">${escapeHtml(fmt.desc)}</div></div>
      </label>`
    ).join('');

    return `
      <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/40" data-action="import-modal-backdrop">
        <div class="bg-white dark:bg-gray-900 rounded-xl shadow-xl w-full max-w-md mx-4 p-6">
          <h2 class="text-lg font-bold mb-1">Import Collection</h2>
          <p class="text-sm text-gray-500 mb-4">Import from Postman, OpenAPI, or HttpForge JSON into ${escapeHtml(state.projectName)}</p>
          <div class="space-y-2 mb-4">${formats}</div>
          <div class="flex justify-end gap-2">
            <button data-action="import-modal-close" class="px-4 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg">Cancel</button>
            <button data-action="import-modal-submit" class="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700">Choose File & Import</button>
          </div>
        </div>
      </div>`;
  }

  function renderAboutPage() {
    const info = appInfo;
    const features = Array.isArray(info.features) ? info.features : [];
    const featureList = features
      .map((f) => `<li class="flex items-start gap-2 text-sm text-gray-600 dark:text-gray-400"><span class="text-blue-500 mt-0.5">✓</span><span>${escapeHtml(f)}</span></li>`)
      .join('');

    const contacts = [
      { icon: '✉', label: t('about.email'), value: info.email, href: `mailto:${info.email}` },
      { icon: '🌐', label: t('about.website'), value: info.website.replace(/^https?:\/\//, ''), href: info.website },
      { icon: '📖', label: t('about.docs'), value: info.docs.replace(/^https?:\/\//, ''), href: info.docs },
      { icon: '🐙', label: t('about.github'), value: info.github.replace(/^https:\/\/github.com\//, ''), href: info.github },
    ];

    const contactCards = contacts
      .map(
        (c) => `
        <button type="button" data-action="open-link" data-href="${escapeHtml(c.href)}" class="flex items-center gap-3 w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-600 hover:bg-blue-50/50 dark:hover:bg-blue-900/20 transition-colors text-left">
          <div class="w-9 h-9 rounded-lg bg-gray-50 dark:bg-gray-800 flex items-center justify-center shrink-0 text-base">${c.icon}</div>
          <div class="min-w-0">
            <p class="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">${escapeHtml(c.label)}</p>
            <p class="text-sm font-medium truncate">${escapeHtml(c.value)}</p>
          </div>
        </button>`
      )
      .join('');

    return `
      <div class="flex-1 overflow-y-auto p-6 bg-gray-50 dark:bg-gray-950">
        <div class="max-w-2xl mx-auto">
          <div class="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-2xl overflow-hidden shadow-sm">
            <div class="px-8 pt-10 pb-8 text-center bg-gradient-to-b from-blue-50/80 to-white dark:from-blue-950/40 dark:to-gray-900">
            ${window.HTTPFORGE_LOGO_URI ? `<img src="${window.HTTPFORGE_LOGO_URI}" alt="HttpForge" class="w-[181px]  rounded-2xl mx-auto mb-4 shadow-lg object-contain shrink-0" />` : ''}
              <h1 class="page-title">${escapeHtml(info.name)}</h1>
              <p class="text-sm text-gray-500 mt-1">${t('about.version', { version: info.version })}</p>
              <p class="text-sm font-semibold text-blue-600 dark:text-blue-400 mt-3">${escapeHtml(info.tagline)}</p>
              <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">${escapeHtml(info.openSourceTagline || '')}</p>
              <div class="flex items-center justify-center gap-2 mt-3 flex-wrap">
                <span class="inline-block px-3 py-1 text-xs font-medium bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300 rounded-full">${t('about.openSource')}</span>
                <span class="inline-block px-3 py-1 text-xs font-medium bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300 rounded-full">${t('about.privacyFirst')}</span>
                <span class="inline-block px-3 py-1 text-xs font-medium bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 rounded-full">${escapeHtml(info.platform)}</span>
              </div>
            </div>
            <div class="px-8 py-6 space-y-6">
              <p class="text-sm text-gray-600 dark:text-gray-400 leading-relaxed text-center">${escapeHtml(info.description)}</p>
              ${featureList ? `<div><h2 class="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">${t('about.features')}</h2><ul class="space-y-2">${featureList}</ul></div>` : ''}
              <div class="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/30 p-4">
                <h2 class="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">${t('about.license')}</h2>
                <p class="text-sm font-semibold text-gray-800 dark:text-gray-200">${escapeHtml(info.license)}</p>
                <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">${escapeHtml(info.copyright)}</p>
                <p class="text-xs text-gray-500 dark:text-gray-400 mt-2">${t('about.licenseDesc')}</p>
              </div>
              <div>
                <h2 class="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">${t('about.contact')}</h2>
                <div class="space-y-2">${contactCards}</div>
              </div>
              <div class="border-t border-gray-100 dark:border-gray-800 pt-4 text-xs text-gray-500">
                <div><span class="font-medium text-gray-700 dark:text-gray-300">${t('about.author')}</span><br>${escapeHtml(info.author)}</div>
              </div>
            </div>
          </div>
        </div>
      </div>`;
  }

  function renderSettingsPage() {
    const activeLang = state.language || 'en';
    const languages = window.HTTPFORGE_I18N?.languages ?? [{ id: 'en', label: 'English' }];
    const langButtons = languages
      .map((lang) => {
        const isActive = activeLang === lang.id;
        return `<button data-action="set-language" data-language="${lang.id}" class="px-3 py-1.5 text-sm rounded-lg border whitespace-nowrap ${isActive ? 'bg-blue-600 text-white border-blue-600 font-medium' : 'border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300'}">${escapeHtml(lang.label)}</button>`;
      })
      .join('');
    const modeLabel = systemIsDark ? t('theme.dark') : t('theme.light');

    return `
      <div class="flex-1 overflow-y-auto p-6 bg-gray-50 dark:bg-gray-950">
        <div class=" mx-auto">
          <h1 class="page-title mb-6">${t('settings.title')}</h1>
          <div class="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-5 space-y-4">
            <div>
              <div class="font-medium mb-1">${t('settings.language')}</div>
              <div class="text-sm text-gray-500 mb-3">${t('settings.languageDesc')}</div>
              <div class="flex flex-wrap gap-2">${langButtons}</div>
            </div>
            <div class="border-t border-gray-100 dark:border-gray-800 pt-4">
              <div class="font-medium mb-1">${t('settings.appearance')}</div>
              <div class="text-sm text-gray-500 mb-3">${t('settings.appearanceDesc')}</div>
              <div class="flex gap-2 flex-wrap">
                <button data-action="set-theme" data-theme="system" class="px-4 py-2 text-sm rounded-lg border ${state.themeMode === 'system' ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800'}">💻 ${t('settings.system')}</button>
                <button data-action="set-theme" data-theme="light" class="px-4 py-2 text-sm rounded-lg border ${state.themeMode === 'light' ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800'}">☀️ ${t('settings.light')}</button>
                <button data-action="set-theme" data-theme="dark" class="px-4 py-2 text-sm rounded-lg border ${state.themeMode === 'dark' ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800'}">🌙 ${t('settings.dark')}</button>
              </div>
              <p class="text-xs text-gray-400 mt-2">${t('settings.systemNote', { mode: modeLabel })}</p>
            </div>
            <div class="border-t border-gray-100 dark:border-gray-800 pt-4">
              <div class="font-medium mb-1">${t('settings.activeEnvironment')}</div>
              <div class="text-sm text-gray-600 dark:text-gray-400">${escapeHtml(getActiveEnv()?.name ?? t('settings.none'))}</div>
            </div>
          </div>
        </div>
      </div>`;
  }

  function renderWorkspacePage() {
    const req = getActiveRequest();
    const resp = state.lastResponse;
    const activeProto = normalizeProtocol(state.activeProtocol);

    const tabsHtml = state.openTabs
      .map((tabId) => {
        const r = state.folders.flatMap((f) => f.requests).find((x) => x.id === tabId);
        if (!r || getRequestProtocol(r) !== activeProto) return '';
        const rp = getRequestProtocol(r);
        const tabLabel = explorerMethodLabel(r);
        const tabColor =
          rp === 'graphql'
            ? 'text-pink-600'
            : rp === 'soap'
              ? 'text-purple-600'
              : rp === 'websocket'
                ? 'text-yellow-600'
                : rp === 'grpc'
                  ? 'text-green-600'
                  : METHOD_COLORS[r.method] || '';
        return `
        <div class="request-tab-item${tabId === state.activeTabId ? ' is-active' : ''}" data-action="switch-tab" data-tab-id="${tabId}">
          <span class="request-tab-method shrink-0 ${tabColor}">${tabLabel}</span>
          ${renderInlineTabTitle(r)}
          <button data-action="close-tab" data-tab-id="${tabId}" class="request-tab-close shrink-0" title="Close tab" aria-label="Close tab"><svg class="request-tab-close-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8"/></svg></button>
        </div>`;
      })
      .join('');

    const respTabs = (() => {
      const isSoapReq = req && getRequestProtocol(req) === 'soap';
      if (isSoapReq) {
        return [
          ['xml', 'XML'],
          ['tree', 'Tree'],
          ['raw', 'Raw'],
          ['headers', `Headers (${resp ? (Object.keys(resp.request?.headers ?? {}).length + Object.keys(resp.headers).length) : 0})`],
          ['timeline', 'Timeline'],
        ];
      }
      return [
        ['json', 'JSON'],
        ['raw', 'Raw'],
        ['headers', `Headers (${resp ? (Object.keys(resp.request?.headers ?? {}).length + Object.keys(resp.headers).length) : 0})`],
        ['timeline', 'Timeline'],
      ];
    })();

    const respTabHtml = respTabs
      .map(
        ([id, label]) =>
          `<button data-action="response-tab" data-tab="${id}" class="px-3 py-2.5 text-sm ${state.activeResponseTab === id ? 'tab-active' : 'text-gray-500 hover:text-gray-700'}">${label}</button>`
      )
      .join('');

    const timelineChart = renderTimelineBarChart(resp?.timeline);
    const perfChart = renderPerformanceBarChart();

    return `
          <div class="flex flex-1 flex-col min-h-0 overflow-hidden">
          <div class="flex flex-1 overflow-hidden min-h-0">
            <!-- Request Editor -->
            <div class="flex-1 flex flex-col min-w-[650px] bg-white dark:bg-gray-900">
              <div class="request-tabs-bar shrink-0">
                <div class="request-tabs-scroll">${tabsHtml}</div>
                <div class="request-tabs-actions">
                  <div class="request-tab-menu-wrap relative">
                    <button data-action="toggle-tab-menu" class="request-tab-menu-btn" title="Tab actions" aria-label="Tab actions" aria-expanded="${tabMenuOpen}">⋯</button>
                    <div class="dropdown-menu tab-menu-dropdown ${tabMenuOpen ? 'open' : ''}">${renderTabMenu()}</div>
                  </div>
                </div>
              </div>

              ${
                req
                  ? `<div class="flex-1 flex flex-col min-h-0 overflow-hidden">${renderRequestBuilder(req)}</div>`
                  : '<div class="flex-1 flex items-center justify-center text-gray-400">Select or create a request</div>'
              }
            </div>

            <div class="panel-resizer" data-resizer="response" title="Drag to resize response panel" aria-label="Resize response panel"></div>

            <!-- Response -->
            <div id="response-panel" class="flex flex-col bg-white dark:bg-gray-900 shrink-0 min-w-0 min-h-0 overflow-hidden" style="width:${responsePanelWidth}px">
              <div class="flex items-center gap-3 px-4 py-2 border-b border-gray-200 dark:border-gray-700 text-sm shrink-0">
                ${
                  resp
                    ? `<span class="font-semibold ${statusClass(resp.status)}">${resp.status} ${escapeHtml(resp.statusText)}</span>
                       <span class="text-gray-400">${resp.durationMs} ms</span>
                       <span class="text-gray-400">${formatBytes(resp.sizeBytes)}</span>`
                    : '<span class="text-gray-400">No response</span>'
                }
              </div>
              <div class="flex items-center border-b border-gray-200 dark:border-gray-700 px-3 shrink-0">
                <div class="flex items-center flex-1 min-w-0 overflow-x-auto">${respTabHtml}</div>
                ${
                  resp
                    ? `<div class="flex items-center shrink-0 pl-2 ml-auto border-l border-gray-200 dark:border-gray-700">
                        ${iconActionBtn('data-action="download-response"', 'export', 'Download response', 'standalone icon-only response-download-btn')}
                      </div>`
                    : ''
                }
              </div>
              <div class="response-content">${renderResponseContent()}</div>
            </div>
          </div>

          <!-- Bottom: Console (left) + Charts (right) -->
          <div class="h-44 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700 flex shrink-0 min-h-0">
            <div class="flex-1 min-w-0 border-r border-gray-200 dark:border-gray-700">${renderConsolePanel()}</div>
            <div class="w-[340px] shrink-0 flex min-h-0">
              <div class="flex-1 flex flex-col px-3 py-2 border-r border-gray-200 dark:border-gray-700 min-w-0 overflow-hidden">
                <div class="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1 shrink-0">Response Timeline</div>
                <div class="flex-1 min-h-0 overflow-hidden">${timelineChart}</div>
              </div>
              <div class="w-[148px] shrink-0 flex flex-col px-3 py-2 min-h-0 overflow-hidden">
                <div class="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1 shrink-0">Performance</div>
                <div class="grid grid-cols-3 gap-1 py-0.5 text-center shrink-0">
                  <div><div class="text-sm font-bold leading-tight">${state.performance.avgResponseMs}<span class="text-[9px] font-normal text-gray-400">ms</span></div><div class="text-[9px] text-gray-400">Avg</div></div>
                  <div><div class="text-sm font-bold leading-tight">${state.history.length}</div><div class="text-[9px] text-gray-400">Sent</div></div>
                  <div><div class="text-sm font-bold leading-tight text-green-600">${state.performance.successRate}%</div><div class="text-[9px] text-gray-400">OK</div></div>
                </div>
                <div class="flex-1 min-h-0 flex items-end overflow-hidden">${perfChart}</div>
              </div>
            </div>
          </div>
          </div>`;
  }

  function render() {
    if (!state) return;
    hideEnvVarPicker();
    const env = getActiveEnv();
    const dark = isDarkMode() ? 'dark' : '';

    const envMenu = state.environments
      .map(
        (e) => `
      <button data-action="set-env" data-env-id="${e.id}" class="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-800 text-left ${e.id === state.activeEnvironmentId ? 'font-medium' : ''}">
        <span class="w-2 h-2 rounded-full shrink-0 ${e.color?.startsWith('#') ? '' : `env-dot-${e.color || 'blue'}`}" ${e.color?.startsWith('#') ? `style="background-color:${e.color}"` : ''}></span>
        ${escapeHtml(e.name)}
        ${e.id === state.activeEnvironmentId ? '<span class="ml-auto text-blue-600">✓</span>' : ''}
      </button>`
      )
      .join('');

    const sidebarNav = [
      ['workspace', 'nav.workspace'],
      ['collections', 'nav.collections'],
      ['environments', 'nav.environments'],
      ['git', 'nav.git'],
      ['apidocs', 'nav.apidocs'],
      ['history', 'nav.history'],
    ];

    const navHtml = sidebarNav
      .map(
        ([id, key]) => `
      <button data-action="sidebar-nav" data-nav="${id}" class="flex items-center gap-3 px-3 py-2 w-full text-left rounded-lg text-sm ${state.sidebarNav === id ? 'nav-active' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'}">${t(key)}</button>`
      )
      .join('');

    const aboutActive = state.sidebarNav === 'about';
    const aboutFooter = `
      <div class="border-t border-gray-200 dark:border-gray-700 px-2 py-1.5 mt-auto shrink-0">
        <button data-action="sidebar-nav" data-nav="about" class="sidebar-about-footer flex items-center justify-between gap-2 w-full px-2 py-1.5 text-left rounded-lg ${aboutActive ? 'nav-active' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'}">
          <span>${t('nav.about')}</span>
          <span class="sidebar-about-version text-gray-400 dark:text-gray-500">v${escapeHtml(appInfo.version ?? '0.0.0')}</span>
        </button>
      </div>`;

    document.getElementById('app').innerHTML = `
    <div class="${dark} h-full flex flex-col">
      <header class="header-bar h-14 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 shrink-0">
        <div class="header-left">
          ${renderProjectName()}
          <span class="header-protocol-divider header-project-divider" aria-hidden="true"></span>
        </div>
        <div class="header-center">
          ${renderProtocolTabs()}
        </div>
        <div class="header-right">
          ${renderSearchBar()}
          <div class="flex items-center gap-2 shrink-0">
            <div class="relative">
              <button type="button" data-action="toggle-env-dropdown" class="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 border border-gray-200 dark:border-gray-700 text-sm">
                ${envDotHtml(env?.color || 'green')}
                <span>${env ? escapeHtml(env.name) : t('header.environment')}</span>
                <span>▾</span>
              </button>
              <div class="dropdown-menu ${envDropdownOpen ? 'open' : ''} bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg py-1 min-w-[160px]">${envMenu}</div>
            </div>
            <div class="relative header-gear-wrap">
              <button type="button" data-action="toggle-gear-dropdown" class="p-2 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-lg text-gray-600 dark:text-gray-400" title="${t('nav.settings')}" aria-label="${t('nav.settings')}" aria-expanded="${gearDropdownOpen}">
                <svg class="header-gear-icon" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"/>
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9c.26.604.852.997 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"/>
                </svg>
              </button>
              <div class="dropdown-menu gear-dropdown ${gearDropdownOpen ? 'open' : ''} bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg py-1">${renderGearMenu()}</div>
            </div>
          </div>
        </div>
      </header>

      <div class="flex flex-1 overflow-hidden min-h-0">
        <aside class="w-48 bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-700 flex flex-col shrink-0">
          <div class="p-3">
            <button data-action="new-request" class="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg">${t('header.newRequest')}</button>
          </div>
          <nav class="flex-1 px-2 space-y-0.5 overflow-y-auto">${navHtml}</nav>
          ${aboutFooter}
        </aside>

        <main class="flex-1 flex flex-col overflow-hidden min-w-0 min-h-0">
          ${renderPageContent()}
        </main>
      </div>
      ${renderDeleteRequestModal()}
    </div>`;

    applyThemeClass();
    if (editingRequestTitleId) {
      requestAnimationFrame(() => {
        const input = document.querySelector(
          `[data-action="inline-request-title"][data-request-id="${editingRequestTitleId}"]`
        );
        if (input && document.activeElement !== input) {
          input.focus();
          input.select();
        }
      });
    }
    if (editingCollectionNameId) {
      requestAnimationFrame(() => {
        const input = document.querySelector(
          `[data-action="inline-collection-name"][data-folder-id="${editingCollectionNameId}"]`
        );
        if (input && document.activeElement !== input) {
          input.focus();
          input.select();
        }
      });
    }
  }

  function findFolderById(id) {
    return state.folders.find((f) => f.id === id);
  }

  function findRequestById(id) {
    for (const folder of state.folders) {
      const req = folder.requests.find((r) => r.id === id);
      if (req) return req;
    }
    return null;
  }

  function renderInlineCollectionName(folder) {
    if (editingCollectionNameId === folder.id) {
      return `<input data-action="inline-collection-name" data-folder-id="${folder.id}" type="text" value="${escapeHtml(folder.name)}" class="inline-collection-name-input inline-request-title-input flex-1 min-w-0" />`;
    }
    return `<span data-edit-collection-id="${folder.id}" class="collection-name-label truncate flex-1 min-w-0 text-left cursor-pointer" title="${escapeHtml(folder.name)} — double-click to rename">${escapeHtml(folder.name)}</span>`;
  }

  function renderInlineRequestTitle(r, className = '') {
    if (editingRequestTitleId === r.id) {
      return `<input data-action="inline-request-title" data-request-id="${r.id}" type="text" value="${escapeHtml(r.name)}" class="inline-request-title-input ${className}" />`;
    }
    return `<span data-action="open-request-title" data-request-id="${r.id}" data-edit-title-id="${r.id}" class="request-title-label cursor-pointer ${className}" title="${escapeHtml(r.name)} — click to open, double-click to rename">${escapeHtml(r.name)}</span>`;
  }

  function renderInlineTabTitle(r) {
    if (editingRequestTitleId === r.id) {
      return `<input data-action="inline-request-title" data-request-id="${r.id}" type="text" value="${escapeHtml(r.name)}" class="inline-request-title-input request-tab-name" />`;
    }
    return `<span class="request-tab-name truncate" data-edit-title-id="${r.id}" title="${escapeHtml(r.name)}">${escapeHtml(r.name)}</span>`;
  }

  function beginCollectionNameEdit(folderId) {
    if (!findFolderById(folderId)) return;
    editingCollectionNameId = folderId;
    render();
  }

  function commitInlineCollectionName(folderId, value) {
    const folder = findFolderById(folderId);
    if (!folder) {
      editingCollectionNameId = null;
      render();
      return;
    }
    const name = String(value ?? '').trim();
    editingCollectionNameId = null;
    if (!name || name === folder.name) {
      render();
      return;
    }
    folder.name = name;
    persistState();
    render();
    vscode.postMessage({ type: 'updateCollection', collectionId: folderId, name });
  }

  function beginTitleEdit(requestId) {
    const req = findRequestById(requestId);
    if (!req) return;
    state.activeProtocol = getRequestProtocol(req);
    if (getRequestProtocol(req) === 'graphql') {
      initGraphqlRequest(req);
    }
    if (getRequestProtocol(req) === 'soap') {
      initSoapRequest(req);
      if (!state.activeSoapTab) state.activeSoapTab = 'envelope';
    }
    if (!state.openTabs.includes(requestId)) {
      state.openTabs.push(requestId);
    }
    state.activeTabId = requestId;
    state.sidebarNav = 'workspace';
    editingRequestTitleId = requestId;
    persistState();
    render();
  }

  function startEditRequestTitle(requestId) {
    beginTitleEdit(requestId);
  }

  function commitInlineRequestTitle(requestId, value) {
    const req = findRequestById(requestId);
    if (!req) {
      editingRequestTitleId = null;
      render();
      return;
    }
    const name = String(value ?? '').trim();
    if (name) req.name = name;
    editingRequestTitleId = null;
    persistState();
    render();
  }

  function openRequest(id) {
    const req = findRequestById(id);
    if (req) {
      state.activeProtocol = getRequestProtocol(req);
      if (getRequestProtocol(req) === 'graphql') {
        initGraphqlRequest(req);
      }
      if (getRequestProtocol(req) === 'soap') {
        initSoapRequest(req);
        if (!state.activeSoapTab) state.activeSoapTab = 'envelope';
        if (!state.activeResponseTab || state.activeResponseTab === 'json') {
          state.activeResponseTab = 'xml';
        }
      }
    }
    if (!state.openTabs.includes(id)) {
      state.openTabs.push(id);
    }
    state.activeTabId = id;
    state.sidebarNav = 'workspace';
    persistState();
    render();
  }

  function openProject(projectId) {
    if (projectId === state.projectId) {
      state.sidebarNav = 'workspace';
      persistState();
      render();
      return;
    }
    vscode.postMessage({ type: 'switchProject', projectId });
  }

  function createNewRequest(collectionId, protocol) {
    const p = normalizeProtocol(protocol ?? state.activeProtocol);
    vscode.postMessage({
      type: 'createRequest',
      collectionId: collectionId || undefined,
      protocol: p,
    });
  }

  function sendRequest() {
    const req = getActiveRequest();
    if (!req) return;
    const unresolved = listUnresolvedEnvVars(req.url);
    if (unresolved.length) {
      const env = getActiveEnv();
      const envLabel = env?.name ?? 'your environment';
      vscode.postMessage({
        type: 'notify',
        message: `Unresolved URL variable(s): ${unresolved.join(', ')}. Open Environments, select "${envLabel}", and set their values (e.g. BASE_URL = https://api.example.com).`,
        level: 'error',
      });
      return;
    }
    if (getRequestProtocol(req) === 'graphql') {
      sendGraphQL();
      return;
    }
    if (getRequestProtocol(req) === 'soap') {
      syncSoapConfig(req);
    }
    if (getRequestProtocol(req) === 'grpc') {
      req.method = 'POST';
      const config = ensureRequestConfig(req);
      config.body = req.body ?? '{}';
      config.bodyType = 'json';
      req.bodyType = 'json';
    }
    prepareStateForSend();
    sending = true;
    render();
    vscode.postMessage({
      type: 'sendRequest',
      requestId: req.id,
      state,
    });
  }

  function sendGraphQL() {
    const req = getActiveRequest();
    if (!req) return;
    const unresolved = listUnresolvedEnvVars(req.url);
    if (unresolved.length) {
      const env = getActiveEnv();
      const envLabel = env?.name ?? 'your environment';
      vscode.postMessage({
        type: 'notify',
        message: `Unresolved URL variable(s): ${unresolved.join(', ')}. Open Environments, select "${envLabel}", and set their values (e.g. BASE_URL = https://api.example.com).`,
        level: 'error',
      });
      return;
    }
    prepareStateForSend();
    sending = true;
    render();
    vscode.postMessage({
      type: 'sendGraphQL',
      requestId: req.id,
      query: req.graphqlQuery ?? DEFAULT_GRAPHQL_QUERY,
      variables: req.graphqlVariables ?? '{}',
      state,
    });
  }

  document.getElementById('app').addEventListener('mousedown', (e) => {
    if (/** @type {HTMLElement} */ (e.target).closest('[data-resizer="response"]')) {
      startResponsePanelResize(e);
    }
  });

  document.getElementById('app').addEventListener('click', (e) => {
    const el = /** @type {HTMLElement} */ (e.target).closest('[data-action]');
    if (!el || !state) return;
    const action = el.dataset.action;

    if (action === 'toggle-env-dropdown') {
      gearDropdownOpen = false;
      tabMenuOpen = false;
      protocolPickerOpen = false;
      envDropdownOpen = !envDropdownOpen;
      render();
      return;
    }

    if (action === 'toggle-gear-dropdown') {
      envDropdownOpen = false;
      tabMenuOpen = false;
      protocolPickerOpen = false;
      gearDropdownOpen = !gearDropdownOpen;
      render();
      return;
    }

    if (action === 'toggle-tab-menu') {
      envDropdownOpen = false;
      gearDropdownOpen = false;
      protocolPickerOpen = false;
      tabMenuOpen = !tabMenuOpen;
      render();
      return;
    }

    if (action === 'toggle-protocol-picker') {
      envDropdownOpen = false;
      gearDropdownOpen = false;
      tabMenuOpen = false;
      protocolPickerOpen = !protocolPickerOpen;
      render();
      return;
    }

    if (action === 'pick-collection-protocol') {
      newCollectionProtocol = normalizeProtocol(el.dataset.protocol);
      protocolPickerOpen = false;
      render();
      return;
    }

    envDropdownOpen = false;
    gearDropdownOpen = false;
    tabMenuOpen = false;
    protocolPickerOpen = false;

    if (action === 'gear-menu') {
      const gear = el.dataset.gear;
      const href = el.dataset.href;
      gearDropdownOpen = false;
      if (gear === 'settings') {
        state.sidebarNav = 'settings';
        persistState();
        render();
      } else if (href) {
        vscode.postMessage({ type: 'openExternal', url: href });
      }
      return;
    }

    if (action === 'set-env') {
      state.activeEnvironmentId = el.dataset.envId;
      persistState();
      render();
    } else if (action === 'open-request-title') {
      openRequest(el.dataset.requestId);
    } else if (action === 'open-request') {
      openRequest(el.dataset.requestId);
    } else if (action === 'delete-request') {
      openDeleteRequestModal({
        id: el.dataset.requestId,
        name: el.dataset.requestName ?? 'Request',
        collectionName: el.dataset.collectionName ?? 'collection',
      });
    } else if (action === 'delete-request-modal-close') {
      closeDeleteRequestModal();
    } else if (action === 'delete-request-modal-backdrop') {
      if (e.target === el) closeDeleteRequestModal();
    } else if (action === 'delete-request-modal-submit') {
      submitDeleteRequestModal();
    } else if (action === 'switch-tab') {
      const tabId = el.dataset.tabId;
      if (!tabId || tabId === state.activeTabId) return;
      state.activeTabId = tabId;
      persistState();
      render();
    } else if (action === 'close-tab') {
      closeTabById(el.dataset.tabId, true);
    } else if (action === 'tab-menu') {
      const cmd = el.dataset.tabCmd;
      if (cmd === 'duplicate') duplicateActiveTab();
      else if (cmd === 'close') closeActiveTab();
      else if (cmd === 'force-close') closeActiveTab();
      else if (cmd === 'close-others') closeAllButActiveTab();
      else if (cmd === 'close-all') closeAllTabs();
      else if (cmd === 'force-close-all') closeAllTabs();
    } else if (action === 'reopen-closed-tab') {
      reopenClosedTab(el.dataset.tabId);
    } else if (action === 'toggle-folder') {
      const fid = el.dataset.folderId;
      const folder = state.folders.find((f) => f.id === fid);
      if (!folder) return;
      const isExpanded = folder.expanded !== false;
      folder.expanded = !isExpanded;
      if (folder.expanded) {
        if (!state.expandedFolders.includes(fid)) state.expandedFolders.push(fid);
      } else {
        state.expandedFolders = state.expandedFolders.filter((f) => f !== fid);
      }
      persistState();
      render();
    } else if (action === 'request-tab') {
      const prev = state.activeRequestTab;
      if (prev === 'params') commitBulkEditForTable('params');
      if (prev === 'headers') commitBulkEditForTable('headers');
      state.activeRequestTab = el.dataset.tab;
      persistState();
      render();
    } else if (action === 'response-tab') {
      state.activeResponseTab = el.dataset.tab;
      persistState();
      render();
    } else if (action === 'send') {
      sendRequest();
    } else if (action === 'send-graphql') {
      sendGraphQL();
    } else if (action === 'set-protocol') {
      switchToProtocol(el.dataset.protocol);
    } else if (action === 'create-collection') {
      const nameInput = document.querySelector('[data-action="new-collection-name"]');
      const name = nameInput?.value?.trim();
      const protocol = normalizeProtocol(newCollectionProtocol);
      if (!name) {
        vscode.postMessage({ type: 'notify', message: 'Enter a collection name', level: 'error' });
        return;
      }
      vscode.postMessage({ type: 'createCollection', name, protocol });
    } else if (action === 'create-collection-for-protocol') {
      const p = normalizeProtocol(state.activeProtocol);
      vscode.postMessage({ type: 'createCollection', name: `${protocolLabel(p)} Collection`, protocol: p });
    } else if (action === 'edit-collection') {
      openCollectionModal({
        id: el.dataset.collectionId,
        name: el.dataset.collectionName ?? '',
      });
    } else if (action === 'delete-collection') {
      openDeleteCollectionModal({
        id: el.dataset.collectionId,
        name: el.dataset.collectionName ?? 'Collection',
      });
    } else if (action === 'collection-modal-close') {
      closeCollectionModal();
    } else if (action === 'collection-modal-backdrop') {
      if (e.target === el) closeCollectionModal();
    } else if (action === 'collection-modal-submit') {
      submitCollectionModal();
    } else if (action === 'delete-collection-modal-close') {
      closeDeleteCollectionModal();
    } else if (action === 'delete-collection-modal-backdrop') {
      if (e.target === el) closeDeleteCollectionModal();
    } else if (action === 'delete-collection-modal-submit') {
      submitDeleteCollectionModal();
    } else if (action === 'new-request-in-collection') {
      createNewRequest(el.dataset.collectionId, el.dataset.protocol);
    } else if (action === 'graphql-tab') {
      state.activeGraphqlTab = el.dataset.tab;
      persistState();
      render();
    } else if (action === 'soap-tab') {
      state.activeSoapTab = el.dataset.tab;
      persistState();
      render();
    } else if (action === 'format-soap-xml') {
      const req = getActiveRequest();
      if (!req) return;
      req.body = formatXml(req.body || DEFAULT_SOAP_ENVELOPE);
      ensureRequestConfig(req).body = req.body;
      req.bodyType = 'xml';
      ensureRequestConfig(req).bodyType = 'xml';
      persistState();
      render();
    } else if (action === 'fetch-wsdl') {
      const req = getActiveRequest();
      if (!req) return;
      const urlInput = document.querySelector('[data-action="wsdl-url-input"]');
      const url = urlInput?.value?.trim();
      if (!url) {
        vscode.postMessage({ type: 'notify', message: 'Enter a WSDL URL', level: 'error' });
        return;
      }
      wsdlCache[req.id] = { url, targetNamespace: '', operations: [], loading: true };
      render();
      vscode.postMessage({ type: 'fetchWsdl', url, requestId: req.id });
    } else if (action === 'apply-wsdl-operation') {
      const req = getActiveRequest();
      if (!req) return;
      const opName = el.dataset.opName;
      const opAction = el.dataset.opAction;
      const wsdl = wsdlCache[req.id];
      const config = ensureRequestConfig(req);
      config.soapAction = opAction || opName;
      req.body = buildSoapEnvelopeForOperation(opName, wsdl?.targetNamespace || 'http://example.com/webservice');
      config.body = req.body;
      req.bodyType = 'xml';
      config.bodyType = 'xml';
      if (wsdl?.serviceUrl) req.url = wsdl.serviceUrl;
      state.activeSoapTab = 'envelope';
      persistState();
      render();
      vscode.postMessage({ type: 'notify', message: `Applied operation ${opName}`, level: 'success' });
    } else if (action === 'format-response') {
      if (state.lastResponse?.body) {
        const activeReq = getActiveRequest();
        const isSoap = getRequestProtocol(activeReq) === 'soap';
        const isXml = isXmlContent(state.lastResponse.body, state.lastResponse.headers);
        if (isSoap || isXml) {
          state.lastResponse = { ...state.lastResponse, body: formatXml(state.lastResponse.body) };
        } else {
          try {
            state.lastResponse = {
              ...state.lastResponse,
              body: JSON.stringify(JSON.parse(state.lastResponse.body), null, 2),
            };
          } catch {
            /* keep raw */
          }
        }
        render();
      }
    } else if (action === 'ws-connect') {
      const req = getActiveRequest();
      if (!req) return;
      connectWebSocket(req);
    } else if (action === 'ws-disconnect') {
      const req = getActiveRequest();
      if (!req) return;
      disconnectWebSocket(req);
    } else if (action === 'ws-send') {
      const req = getActiveRequest();
      if (!req) return;
      const input = document.querySelector('[data-action="ws-message-input"]');
      const text = input?.value?.trim();
      if (!text) return;
      const ws = wsSockets[req.id];
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        vscode.postMessage({ type: 'notify', message: 'Connect to the WebSocket before sending a message.', level: 'error' });
        return;
      }
      ws.send(text);
      pushWsMessage(req.id, { type: 'sent', content: text });
      if (input) input.value = '';
      render();
    } else if (action === 'ws-clear') {
      const req = getActiveRequest();
      if (req) wsMessages[req.id] = [];
      render();
    } else if (action === 'cycle-theme') {
      cycleThemeMode();
    } else if (action === 'set-theme') {
      state.themeMode = el.dataset.theme;
      persistState();
      applyThemeClass();
      render();
    } else if (action === 'set-language') {
      state.language = el.dataset.language || 'en';
      persistState();
      applyLanguage();
      render();
    } else if (action === 'toggle-theme') {
      cycleThemeMode();
    } else if (action === 'new-request') {
      createNewRequest(undefined, state.activeProtocol);
    } else if (action === 'new-tab') {
      createNewRequest(undefined, state.activeProtocol);
    } else if (action === 'open-link') {
      if (el.dataset.href) {
        vscode.postMessage({ type: 'openExternal', url: el.dataset.href });
      }
    } else if (action === 'sidebar-nav') {
      const nav = el.dataset.nav;
      if (nav === 'projects') return;
      state.sidebarNav = nav;
      if (el.dataset.nav === 'git' || el.dataset.nav === 'apidocs') {
        vscode.postMessage({ type: 'loadGitStatus' });
      }
      persistState();
      render();
    } else if (action === 'select-env') {
      state.activeEnvironmentId = el.dataset.envId;
      persistState();
      render();
    } else if (action === 'new-environment') {
      openEnvModal({ mode: 'create', name: '', color: ENV_COLORS[0] });
    } else if (action === 'edit-env') {
      openEnvModal({
        mode: 'edit',
        id: el.dataset.envId,
        name: el.dataset.envName,
        color: resolveEnvColor(el.dataset.envColor),
      });
    } else if (action === 'duplicate-env') {
      openEnvModal({
        mode: 'duplicate',
        sourceId: el.dataset.envId,
        sourceName: el.dataset.envName,
        name: `${el.dataset.envName} Copy`,
        color: resolveEnvColor(el.dataset.envColor),
      });
    } else if (action === 'delete-env') {
      openDeleteEnvironmentModal({ id: el.dataset.envId, name: el.dataset.envName ?? 'Environment' });
    } else if (action === 'delete-env-modal-close') {
      closeDeleteEnvironmentModal();
    } else if (action === 'delete-env-modal-backdrop') {
      if (e.target === el) closeDeleteEnvironmentModal();
    } else if (action === 'delete-env-modal-submit') {
      submitDeleteEnvironmentModal();
    } else if (action === 'export-environments') {
      vscode.postMessage({ type: 'exportEnvironments', environmentIds: getSelectedExportEnvironmentIds() });
    } else if (action === 'import-environments') {
      vscode.postMessage({ type: 'importEnvironments' });
    } else if (action === 'open-export-modal') {
      exportModal = {
        format: 'json',
        collectionId: el.dataset.exportScope === 'collection' ? el.dataset.collectionId : null,
        collectionName: el.dataset.exportScope === 'collection' ? el.dataset.collectionName : null,
        includeEnvironments: true,
      };
      render();
    } else if (action === 'open-import-modal') {
      importModal = { format: 'postman' };
      render();
    } else if (action === 'export-modal-close' || action === 'export-modal-backdrop') {
      if (action === 'export-modal-backdrop' && e.target !== el) return;
      exportModal = null;
      render();
    } else if (action === 'export-format-pick') {
      if (exportModal) exportModal.format = el.dataset.format;
      render();
    } else if (action === 'export-modal-include-env') {
      if (exportModal) exportModal.includeEnvironments = el.checked;
    } else if (action === 'export-modal-submit') {
      if (!exportModal) return;
      const isCollectionExport = Boolean(exportModal.collectionId);
      const payload = {
        type: isCollectionExport ? 'exportCollection' : 'exportProject',
        format: exportModal.format,
        includeEnvironments: exportModal.includeEnvironments !== false,
      };
      if (isCollectionExport) payload.collectionId = exportModal.collectionId;
      if (payload.includeEnvironments) payload.environmentIds = getSelectedExportEnvironmentIds();
      vscode.postMessage(payload);
      exportModal = null;
    } else if (action === 'import-modal-close' || action === 'import-modal-backdrop') {
      if (action === 'import-modal-backdrop' && e.target !== el) return;
      importModal = null;
      render();
    } else if (action === 'import-format-pick') {
      if (importModal) importModal.format = el.dataset.format;
      render();
    } else if (action === 'import-modal-submit') {
      if (!importModal) return;
      vscode.postMessage({ type: 'importCollection', format: importModal.format });
      importModal = null;
    } else if (action === 'git-refresh') {
      vscode.postMessage({ type: 'loadGitStatus' });
    } else if (action === 'git-toggle-setup') {
      gitShowSetup = !gitShowSetup;
      render();
    } else if (action === 'git-select-file') {
      const filePath = el.dataset.filePath;
      const staged = el.dataset.staged === '1';
      if (!filePath) return;
      gitSelectedFile = filePath;
      gitSelectedStaged = staged;
      gitDiffContent = '';
      render();
      vscode.postMessage({ type: 'loadGitDiff', filePath, staged });
    } else if (action === 'git-toggle-stage') {
      const filePath = el.dataset.filePath;
      const staged = el.dataset.staged === '1';
      if (!filePath) return;
      e.stopPropagation();
      const gitAction = staged ? 'unstage' : 'stage';
      vscode.postMessage({
        type: 'gitAction',
        action: gitAction,
        payload: { path: filePath },
      });
      setTimeout(() => vscode.postMessage({ type: 'loadGitStatus' }), 800);
    } else if (action === 'git-commit-submit') {
      triggerGitCommit();
    } else if (action === 'git-bottom-tab') {
      gitBottomTab = el.dataset.tab ?? 'log';
      render();
    } else if (action === 'git-select-commit') {
      gitSelectedCommitHash = el.dataset.commitHash ?? null;
      render();
    } else if (action === 'git-side-by-side-toggle') {
      gitSideBySideDiff = /** @type {HTMLInputElement} */ (el).checked;
      render();
    } else if (action === 'git-remote-input') {
      gitRemoteInput = el.value;
    } else if (action === 'git-commit-subject') {
      gitCommitSubject = el.value;
    } else if (action === 'git-commit-body') {
      gitCommitBody = el.value;
    } else if (action === 'git-amend-toggle') {
      gitAmendCommit = /** @type {HTMLInputElement} */ (el).checked;
      render();
    } else if (action === 'git-clone-input') {
      gitCloneUrl = el.value;
    } else if (action === 'git-action') {
      const gitAction = el.dataset.gitAction;
      const payload = {};
      if (gitAction === 'setRemote') payload.url = gitRemoteInput || gitStatus?.remoteUrl || '';
      if (gitAction === 'commit') {
        payload.message = buildGitCommitMessage();
        payload.amend = gitAmendCommit ? '1' : '0';
      }
      if (gitAction === 'clone') payload.url = gitCloneUrl;
      if (gitAction === 'stage' || gitAction === 'unstage') payload.path = el.dataset.filePath ?? '';
      const msg = { type: 'gitAction', action: gitAction, payload };
      if (gitAction === 'publishDocs' || gitAction === 'previewDocs' || gitAction === 'sync') {
        msg.environmentIds = getSelectedExportEnvironmentIds();
      }
      vscode.postMessage(msg);
      if (
        gitAction === 'init' ||
        gitAction === 'chooseRepo' ||
        gitAction === 'sync' ||
        gitAction === 'pull' ||
        gitAction === 'push' ||
        gitAction === 'clone' ||
        gitAction === 'importFromRepo' ||
        gitAction === 'stage' ||
        gitAction === 'unstage' ||
        gitAction === 'stageAll' ||
        gitAction === 'unstageAll' ||
        gitAction === 'commit'
      ) {
        setTimeout(() => vscode.postMessage({ type: 'loadGitStatus' }), 800);
      }
    } else if (action === 'env-modal-close') {
      closeEnvModal();
    } else if (action === 'env-modal-backdrop') {
      if (e.target === el) closeEnvModal();
    } else if (action === 'env-modal-submit') {
      submitEnvModal();
    } else if (action === 'env-modal-color') {
      if (envModal) {
        envModal.color = el.dataset.color;
        render();
      }
    } else if (action === 'copy-env-all') {
      const env = state.environments.find((e) => e.id === el.dataset.envId);
      if (env) {
        const text = Object.entries(env.variables)
          .map(([k, v]) => `${k}=${v}`)
          .join('\n');
        navigator.clipboard.writeText(text);
        vscode.postMessage({ type: 'notify', message: 'All variables copied to clipboard', level: 'success' });
      }
    } else if (action === 'edit-env-var') {
      const env = state.environments.find((e) => e.id === el.dataset.envId);
      if (!env) return;
      const oldKey = el.dataset.varKey;
      const newKey = prompt('Variable name (uppercase, underscores only):', oldKey);
      if (!newKey?.trim()) return;
      const check = validateEnvVarName(newKey);
      if (!check.valid) {
        vscode.postMessage({ type: 'notify', message: check.error, level: 'error' });
        return;
      }
      const newValue = prompt('Variable value:', el.dataset.varValue ?? env.variables[oldKey] ?? '');
      if (newValue === null) return;
      if (check.normalized !== oldKey) delete env.variables[oldKey];
      if (check.normalized !== oldKey && Object.prototype.hasOwnProperty.call(env.variables, check.normalized)) {
        vscode.postMessage({ type: 'notify', message: `Variable "${check.normalized}" already exists`, level: 'error' });
        return;
      }
      env.variables[check.normalized] = newValue;
      flushPersistState();
      render();
    } else if (action === 'add-env-var') {
      const envId = el.dataset.envId;
      const keyInput = document.querySelector(`[data-action="new-env-var-key"][data-env-id="${envId}"]`);
      keyInput?.focus();
    } else if (action === 'delete-env-var') {
      const env = state.environments.find((e) => e.id === el.dataset.envId);
      if (!env) return;
      delete env.variables[el.dataset.varKey];
      flushPersistState();
      render();
    } else if (action === 'toggle-reveal-var') {
      const key = `${el.dataset.envId}:${el.dataset.varKey}`;
      revealedVars[key] = !revealedVars[key];
      render();
    } else if (action === 'copy-env-var') {
      navigator.clipboard.writeText(el.dataset.value || '');
      vscode.postMessage({ type: 'notify', message: 'Copied to clipboard', level: 'success' });
    } else if (action === 'clear-history' || action === 'clear-console') {
      state.history = [];
      expandedConsoleId = null;
      persistState();
      render();
    } else if (action === 'toggle-console-entry') {
      const logId = el.dataset.logId;
      expandedConsoleId = expandedConsoleId === logId ? null : logId;
      render();
    } else if (action === 'history-row') {
      const entry = state.history.find((h) => h.id === el.dataset.historyId);
      if (entry?.requestId) {
        openRequest(entry.requestId);
      }
    } else if (action === 'add-kv') {
      const req = getActiveRequest();
      const table = el.dataset.table;
      if (!req) return;
      const arr = getRequestKeyValues(req, table);
      arr.push({ id: uid(), key: '', value: '', enabled: true });
      persistState();
      render();
      requestAnimationFrame(() => {
        const inputs = document.querySelectorAll(`[data-action="edit-kv"][data-table="${table}"][data-field="key"]`);
        const last = inputs[inputs.length - 1];
        if (last instanceof HTMLInputElement) {
          last.focus();
        }
      });
    } else if (action === 'kv-bulk-edit') {
      const req = getActiveRequest();
      const table = el.dataset.table;
      if (!req || !table) return;
      const bulkKey = kvBulkKey(table);
      kvBulkEditMode[bulkKey] = true;
      kvBulkEditDraft[bulkKey] = keyValuesToBulkText(getRequestKeyValues(req, table));
      render();
    } else if (action === 'kv-key-value-edit') {
      const req = getActiveRequest();
      const table = el.dataset.table;
      if (!req || !table) return;
      const bulkKey = kvBulkKey(table);
      const draft = kvBulkEditDraft[bulkKey] ?? keyValuesToBulkText(getRequestKeyValues(req, table));
      applyBulkEditToRequest(req, table, draft);
      kvBulkEditMode[bulkKey] = false;
      delete kvBulkEditDraft[bulkKey];
      persistState();
      render();
    } else if (action === 'remove-kv') {
      const req = getActiveRequest();
      const table = el.dataset.table;
      const idx = parseInt(el.dataset.index, 10);
      if (!req) return;
      const arr = getRequestKeyValues(req, table);
      if (arr.length <= 1) {
        arr[0] = { id: uid(), key: '', value: '', enabled: true };
      } else {
        arr.splice(idx, 1);
      }
      persistState();
      render();
    } else if (action === 'commit-env-var') {
      commitNewEnvVarFromInputs(el.dataset.envId, {
        clearInputs: true,
        renderAfter: true,
        notifyDuplicate: true,
      });
    } else if (action === 'copy-response') {
      if (state.lastResponse) {
        navigator.clipboard.writeText(state.lastResponse.body);
        vscode.postMessage({ type: 'notify', message: 'Response copied to clipboard', level: 'success' });
      }
    } else if (action === 'download-response') {
      downloadResponse();
    } else if (action === 'history-click') {
      const entry = state.history.find((h) => h.id === el.dataset.historyId);
      if (entry?.requestId) {
        openRequest(entry.requestId);
      }
    }
  });

  document.getElementById('app').addEventListener('blur', (e) => {
    const el = e.target;
    if (!(el instanceof HTMLInputElement)) return;
    const action = el.dataset.action;
    if (action === 'set-env-var') {
      const env = state?.environments.find((item) => item.id === el.dataset.envId);
      if (env && el.dataset.varKey) {
        env.variables[el.dataset.varKey] = el.value;
        flushPersistState();
      }
      return;
    }
    if (action === 'new-env-var-key' || action === 'new-env-var-value') {
      const envId = el.dataset.envId;
      if (envId) {
        commitNewEnvVarFromInputs(envId, { clearInputs: true, renderAfter: true });
      }
    }
  }, true);

  document.getElementById('app').addEventListener('change', (e) => {
    const el = /** @type {HTMLElement} */ (e.target).closest('[data-action]');
    if (!el || !state) return;

    if (el.dataset.action === 'toggle-env-export') {
      const env = state.environments.find((item) => item.id === el.dataset.envId);
      if (env) {
        env.includeInExport = /** @type {HTMLInputElement} */ (el).checked;
        persistState();
        render();
      }
      return;
    }

    if (el.dataset.action === 'console-filter') {
      consoleFilter = /** @type {HTMLSelectElement} */ (el).value;
      expandedConsoleId = null;
      render();
      return;
    }

    const req = getActiveRequest();
    if (!req) return;

    if (el.dataset.action === 'toggle-kv') {
      const arr = getRequestKeyValues(req, el.dataset.table);
      arr[parseInt(el.dataset.index, 10)].enabled = /** @type {HTMLInputElement} */ (el).checked;
      persistState();
      render();
    } else if (el.dataset.action === 'set-method') {
      req.method = /** @type {HTMLSelectElement} */ (el).value;
      persistState();
      render();
    } else if (el.dataset.action === 'set-auth-type') {
      req.authType = /** @type {HTMLSelectElement} */ (el).value;
      const auth = ensureRequestAuth(req);
      auth.type = legacyAuthTypeToConfig(req.authType);
      syncLegacyAuthToken(req);
      persistState();
      render();
    } else if (el.dataset.action === 'set-auth-api-key-in') {
      ensureRequestAuth(req).apiKeyIn = /** @type {HTMLSelectElement} */ (el).value;
      persistState();
    } else if (el.dataset.action === 'set-request-setting') {
      const setting = el.dataset.setting;
      if (setting) {
        ensureRequestConfig(req).settings[setting] = /** @type {HTMLInputElement} */ (el).checked;
        persistState();
      }
    }
  });

  document.getElementById('app').addEventListener('input', (e) => {
    const el = /** @type {HTMLElement} */ (e.target);
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
      if (el.dataset.envAutocomplete === '1') {
        updateEnvVarPicker(el);
      }
    }
    const actionEl = el.closest('[data-action]');
    if (!actionEl || !state) return;
    const req = getActiveRequest();

    if (actionEl.dataset.action === 'search') {
      state.searchQuery = /** @type {HTMLInputElement} */ (actionEl).value;
      render();
      /** restore focus */
      setTimeout(() => {
        const input = document.querySelector('[data-action="search"]');
        if (input) {
          const pos = state.searchQuery.length;
          input.focus();
          input.setSelectionRange(pos, pos);
        }
      }, 0);
    } else if (el.dataset.action === 'project-modal-name') {
      if (projectModal) projectModal.name = /** @type {HTMLInputElement} */ (el).value;
    } else if (el.dataset.action === 'project-modal-description') {
      if (projectModal) projectModal.description = /** @type {HTMLTextAreaElement} */ (el).value;
    } else if (el.dataset.action === 'git-remote-input') {
      gitRemoteInput = /** @type {HTMLInputElement} */ (el).value;
    } else if (el.dataset.action === 'git-clone-input') {
      gitCloneUrl = /** @type {HTMLInputElement} */ (el).value;
    } else if (el.dataset.action === 'git-commit-subject') {
      gitCommitSubject = /** @type {HTMLInputElement} */ (el).value;
    } else if (el.dataset.action === 'git-commit-body') {
      gitCommitBody = /** @type {HTMLTextAreaElement} */ (el).value;
    } else if (el.dataset.action === 'git-log-search') {
      gitLogSearch = /** @type {HTMLInputElement} */ (el).value;
      render();
    } else if (el.dataset.action === 'git-file-sort') {
      gitFileSort = /** @type {HTMLSelectElement} */ (el).value === 'status' ? 'status' : 'path';
      render();
    } else if (el.dataset.action === 'env-modal-name') {
      if (envModal) {
        envModal.name = /** @type {HTMLInputElement} */ (el).value;
      }
    } else if (el.dataset.action === 'new-env-var-key') {
      const input = /** @type {HTMLInputElement} */ (el);
      const start = input.selectionStart ?? input.value.length;
      const end = input.selectionEnd ?? input.value.length;
      const normalized = normalizeEnvVarName(input.value);
      if (input.value !== normalized) {
        input.value = normalized;
        input.setSelectionRange(start, end);
      }
    } else if (el.dataset.action === 'set-env-var') {
      const env = state.environments.find((e) => e.id === el.dataset.envId);
      if (env) {
        env.variables[el.dataset.varKey] = /** @type {HTMLInputElement} */ (el).value;
        persistState();
      }
    } else if (!req) return;
    else if (el.dataset.action === 'set-url') {
      req.url = /** @type {HTMLInputElement} */ (el).value;
      persistState();
    } else if (el.dataset.action === 'set-auth-token') {
      req.authToken = /** @type {HTMLInputElement} */ (el).value;
      syncLegacyAuthToken(req);
      persistState();
    } else if (el.dataset.action === 'set-auth-bearer-token') {
      ensureRequestAuth(req).bearerToken = /** @type {HTMLInputElement} */ (el).value;
      syncLegacyAuthToken(req);
      persistState();
    } else if (el.dataset.action === 'set-auth-oauth-token') {
      ensureRequestAuth(req).oauthToken = /** @type {HTMLInputElement} */ (el).value;
      syncLegacyAuthToken(req);
      persistState();
    } else if (el.dataset.action === 'set-auth-basic-user') {
      ensureRequestAuth(req).basicUsername = /** @type {HTMLInputElement} */ (el).value;
      persistState();
    } else if (el.dataset.action === 'set-auth-basic-pass') {
      ensureRequestAuth(req).basicPassword = /** @type {HTMLInputElement} */ (el).value;
      syncLegacyAuthToken(req);
      persistState();
    } else if (el.dataset.action === 'set-auth-api-key-name') {
      ensureRequestAuth(req).apiKeyName = /** @type {HTMLInputElement} */ (el).value;
      persistState();
    } else if (el.dataset.action === 'set-auth-api-key-value') {
      ensureRequestAuth(req).apiKeyValue = /** @type {HTMLInputElement} */ (el).value;
      syncLegacyAuthToken(req);
      persistState();
    } else if (el.dataset.action === 'set-body') {
      req.body = /** @type {HTMLTextAreaElement} */ (el).value;
      ensureRequestConfig(req).body = req.body;
      persistState();
    } else if (el.dataset.action === 'set-body-type') {
      req.bodyType = /** @type {HTMLSelectElement} */ (el).value;
      ensureRequestConfig(req).bodyType = req.bodyType;
      persistState();
      render();
    } else if (el.dataset.action === 'set-pre-request-script') {
      ensureRequestConfig(req).preRequestScript = /** @type {HTMLTextAreaElement} */ (el).value;
      persistState();
    } else if (el.dataset.action === 'set-test-script') {
      ensureRequestConfig(req).testScript = /** @type {HTMLTextAreaElement} */ (el).value;
      persistState();
    } else if (el.dataset.action === 'set-request-timeout') {
      const ms = parseInt(/** @type {HTMLInputElement} */ (el).value, 10);
      ensureRequestConfig(req).settings.timeoutMs = Number.isFinite(ms) && ms >= 0 ? ms : 0;
      persistState();
    } else if (el.dataset.action === 'set-graphql-query') {
      req.graphqlQuery = /** @type {HTMLTextAreaElement} */ (el).value;
      persistState();
    } else if (el.dataset.action === 'set-graphql-variables') {
      req.graphqlVariables = /** @type {HTMLTextAreaElement} */ (el).value;
      persistState();
    } else if (el.dataset.action === 'set-soap-action') {
      ensureRequestConfig(req).soapAction = /** @type {HTMLInputElement} */ (el).value;
      persistState();
    } else if (el.dataset.action === 'set-soap-body') {
      req.body = /** @type {HTMLTextAreaElement} */ (el).value;
      req.bodyType = 'xml';
      const config = ensureRequestConfig(req);
      config.body = req.body;
      config.bodyType = 'xml';
      persistState();
    } else if (el.dataset.action === 'set-soap-content-type') {
      ensureRequestConfig(req).soapContentType = /** @type {HTMLSelectElement} */ (el).value;
      persistState();
      render();
    } else if (el.dataset.action === 'wsdl-url-input') {
      if (wsdlCache[req.id]) wsdlCache[req.id].url = /** @type {HTMLInputElement} */ (el).value;
    } else if (el.dataset.action === 'set-request-name') {
      req.name = /** @type {HTMLInputElement} */ (el).value;
      persistState();
    } else if (el.dataset.action === 'edit-kv') {
      const arr = getRequestKeyValues(req, el.dataset.table);
      arr[parseInt(el.dataset.index, 10)][el.dataset.field] = /** @type {HTMLInputElement} */ (el).value;
      persistState();
    } else if (el.dataset.action === 'kv-bulk-input') {
      const table = el.dataset.table;
      if (table) {
        kvBulkEditDraft[kvBulkKey(table)] = /** @type {HTMLTextAreaElement} */ (el).value;
      }
    }
  });

  document.getElementById('app').addEventListener('dblclick', (e) => {
    const collectionEl = /** @type {HTMLElement} */ (e.target).closest('[data-edit-collection-id]');
    if (collectionEl) {
      e.preventDefault();
      e.stopPropagation();
      beginCollectionNameEdit(collectionEl.dataset.editCollectionId);
      return;
    }
    const titleEl = /** @type {HTMLElement} */ (e.target).closest('[data-edit-title-id]');
    if (!titleEl || !state) return;
    e.preventDefault();
    e.stopPropagation();
    beginTitleEdit(titleEl.dataset.editTitleId);
  });

  document.getElementById('app').addEventListener('blur', (e) => {
    const el = /** @type {HTMLElement} */ (e.target);
    if (!el?.dataset?.action || !state) return;
    if (el.dataset.action === 'inline-request-title') {
      commitInlineRequestTitle(el.dataset.requestId, /** @type {HTMLInputElement} */ (el).value);
    } else if (el.dataset.action === 'inline-collection-name') {
      commitInlineCollectionName(el.dataset.folderId, /** @type {HTMLInputElement} */ (el).value);
    } else if (el.dataset.action === 'set-request-name') {
      render();
    }
  }, true);

  document.getElementById('app').addEventListener('keydown', (e) => {
    if (handleEnvVarPickerKeydown(e)) return;

    const target = /** @type {HTMLElement} */ (e.target);
    const isEditing =
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      target.isContentEditable;

    if (state && state.sidebarNav === 'workspace' && !isEditing) {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && (e.key === 'w' || e.key === 'W')) {
        e.preventDefault();
        closeActiveTab();
        return;
      }
    }

    const el = target;
    if (el?.dataset?.action === 'inline-request-title') {
      if (e.key === 'Enter') {
        e.preventDefault();
        commitInlineRequestTitle(el.dataset.requestId, /** @type {HTMLInputElement} */ (el).value);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        editingRequestTitleId = null;
        render();
      }
    } else if (el?.dataset?.action === 'inline-collection-name') {
      if (e.key === 'Enter') {
        e.preventDefault();
        commitInlineCollectionName(el.dataset.folderId, /** @type {HTMLInputElement} */ (el).value);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        editingCollectionNameId = null;
        render();
      }
    }
  }, true);

  document.getElementById('app').addEventListener('keyup', (e) => {
    const el = e.target;
    if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) return;
    if (el.dataset.envAutocomplete !== '1') return;
    if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) {
      updateEnvVarPicker(el);
    }
  });

  document.getElementById('app').addEventListener('click', (e) => {
    const el = e.target;
    if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) return;
    if (el.dataset.envAutocomplete !== '1') return;
    updateEnvVarPicker(el);
  });

  document.getElementById('app').addEventListener('focusin', (e) => {
    const el = e.target;
    if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) return;
    if (el.dataset.envAutocomplete !== '1') return;
    updateEnvVarPicker(el);
  });

  document.getElementById('app').addEventListener('focusout', () => {
    setTimeout(() => {
      const active = document.activeElement;
      if (active?.closest?.('#env-var-picker')) return;
      if (envVarPicker.input && active !== envVarPicker.input) {
        hideEnvVarPicker();
      }
    }, 150);
  });

  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      if (state?.sidebarNav === 'git') {
        if (canGitCommit()) {
          e.preventDefault();
          triggerGitCommit();
        }
        return;
      }
      e.preventDefault();
      sendRequest();
    }
  });

  window.addEventListener('message', (event) => {
    const msg = event.data;
    switch (msg.type) {
      case 'init':
        state = msg.state;
        if (msg.appInfo) appInfo = msg.appInfo;
        systemIsDark = msg.systemIsDark ?? false;
        requestDeletePending = false;
        collectionDeletePending = false;
        projectDeletePending = false;
        editingRequestTitleId = null;
        editingCollectionNameId = null;
        envModal = null;
        projectModal = null;
        deleteProjectModal = null;
        deleteEnvironmentModal = null;
        deleteRequestModal = null;
        collectionModal = null;
        deleteCollectionModal = null;
        if (!state.themeMode) {
          state.themeMode = 'system';
        }
        if (!state.language) {
          state.language = 'en';
        }
        if (!state.activeProtocol) {
          state.activeProtocol = 'http';
        }
        if (!state.activeGraphqlTab) {
          state.activeGraphqlTab = 'query';
        }
        if (!state.activeSoapTab) {
          state.activeSoapTab = 'envelope';
        }
        ensureActiveRequestDefaults();
        if (!state.projects) {
          state.projects = [];
        }
        if (state.sidebarNav === 'projects') {
          state.sidebarNav = 'workspace';
        }
        if (!state.planLimits) {
          state.planLimits = { tierName: 'Free', maxProjects: Number.MAX_SAFE_INTEGER, projectCount: state.projects.length, canCreateProject: true };
        }
        if (state.sidebarNav === 'dashboard' || state.sidebarNav === 'import-export') {
          state.sidebarNav = 'workspace';
          persistState();
        }
        sending = false;
        applyThemeClass();
        render();
        break;
      case 'theme':
        systemIsDark = msg.systemIsDark ?? false;
        applyThemeClass();
        render();
        break;
      case 'sending':
        sending = true;
        render();
        break;
      case 'error':
        sending = false;
        requestDeletePending = false;
        collectionDeletePending = false;
        projectDeletePending = false;
        render();
        vscode.postMessage({ type: 'notify', message: msg.message, level: 'error' });
        break;
      case 'success':
        requestDeletePending = false;
        collectionDeletePending = false;
        projectDeletePending = false;
        deleteProjectModal = null;
        if (msg.state) {
          state = msg.state;
        }
        render();
        vscode.postMessage({ type: 'notify', message: msg.message, level: 'success' });
        break;
      case 'response':
        sending = false;
        if (msg.result) state.lastResponse = msg.result;
        if (msg.historyEntry) state.history = [msg.historyEntry, ...(state.history ?? [])].slice(0, 100);
        persistState();
        render();
        break;
      case 'gitStatus':
        gitStatus = msg.status;
        if (msg.status?.remoteUrl) gitRemoteInput = msg.status.remoteUrl;
        if (!gitSelectedCommitHash && msg.status?.commits?.[0]) {
          gitSelectedCommitHash = msg.status.commits[0].hash;
        }
        if (!gitSelectedFile) {
          const firstStaged = msg.status?.stagedFiles?.[0];
          const firstUnstaged = msg.status?.unstagedFiles?.[0];
          const pick = firstStaged ?? firstUnstaged;
          if (pick) {
            gitSelectedFile = pick.path;
            gitSelectedStaged = !!firstStaged;
            vscode.postMessage({
              type: 'loadGitDiff',
              filePath: pick.path,
              staged: !!firstStaged,
            });
          }
        } else {
          const stillStaged = msg.status?.stagedFiles?.some((f) => f.path === gitSelectedFile);
          const stillUnstaged = msg.status?.unstagedFiles?.some((f) => f.path === gitSelectedFile);
          if (!stillStaged && !stillUnstaged) {
            gitSelectedFile = null;
            gitDiffContent = '';
          } else if (stillStaged && gitSelectedStaged) {
            vscode.postMessage({ type: 'loadGitDiff', filePath: gitSelectedFile, staged: true });
          } else if (stillUnstaged && !gitSelectedStaged) {
            vscode.postMessage({ type: 'loadGitDiff', filePath: gitSelectedFile, staged: false });
          } else if (stillStaged) {
            gitSelectedStaged = true;
            vscode.postMessage({ type: 'loadGitDiff', filePath: gitSelectedFile, staged: true });
          } else if (stillUnstaged) {
            gitSelectedStaged = false;
            vscode.postMessage({ type: 'loadGitDiff', filePath: gitSelectedFile, staged: false });
          }
        }
        render();
        break;
      case 'gitDiff':
        if (msg.filePath === gitSelectedFile && msg.staged === gitSelectedStaged) {
          gitDiffContent = msg.diff ?? '';
          render();
        }
        break;
      case 'wsdlParsed': {
        wsdlCache[msg.requestId] = {
          url: wsdlCache[msg.requestId]?.url ?? '',
          targetNamespace: msg.targetNamespace,
          serviceUrl: msg.serviceUrl,
          operations: msg.operations ?? [],
          loading: false,
        };
        const req = findRequestById(msg.requestId);
        if (req && msg.serviceUrl) {
          req.url = msg.serviceUrl;
        }
        render();
        vscode.postMessage({
          type: 'notify',
          message: `Loaded ${msg.operations?.length ?? 0} SOAP operation(s) from WSDL`,
          level: 'success',
        });
        break;
      }
      case 'wsdlError':
        if (msg.requestId && wsdlCache[msg.requestId]) {
          wsdlCache[msg.requestId].loading = false;
          wsdlCache[msg.requestId].error = msg.message;
        }
        render();
        vscode.postMessage({ type: 'notify', message: msg.message, level: 'error' });
        break;
    }
  });

  vscode.postMessage({ type: 'ready' });
})();
