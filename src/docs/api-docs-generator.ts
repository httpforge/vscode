import { APP_NAME } from '../branding'
import type { ApiDocumentation, DetailedDocEndpoint } from './doc-spec-builder'

export interface OpenApiSpec {
  openapi: string
  info: {
    title: string
    version: string
    description?: string
  }
  paths: Record<string, Record<string, OpenApiOperation>>
}

export interface OpenApiOperation {
  summary?: string
  description?: string
  tags?: string[]
  responses?: Record<string, { description?: string }>
}

export interface DocEndpoint {
  tag: string
  method: string
  path: string
  summary: string
  description: string
}

const METHOD_COLORS: Record<string, { bg: string; text: string }> = {
  GET: { bg: '#DCFCE7', text: '#166534' },
  POST: { bg: '#DBEAFE', text: '#1E40AF' },
  PUT: { bg: '#FEF3C7', text: '#92400E' },
  PATCH: { bg: '#F3E8FF', text: '#6B21A8' },
  DELETE: { bg: '#FEE2E2', text: '#991B1B' },
  HEAD: { bg: '#F1F5F9', text: '#475569' },
  OPTIONS: { bg: '#F1F5F9', text: '#475569' },
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function extractEndpoints(spec: OpenApiSpec): DocEndpoint[] {
  const endpoints: DocEndpoint[] = []
  for (const [path, methods] of Object.entries(spec.paths ?? {})) {
    for (const [method, op] of Object.entries(methods)) {
      if (method === 'parameters') continue
      const operation = op as OpenApiOperation
      endpoints.push({
        tag: operation.tags?.[0] ?? 'General',
        method: method.toUpperCase(),
        path,
        summary: operation.summary ?? `${method.toUpperCase()} ${path}`,
        description: operation.description ?? '',
      })
    }
  }
  return endpoints.sort((a, b) => a.tag.localeCompare(b.tag) || a.path.localeCompare(b.path))
}

export function generateApiDocsHtml(spec: OpenApiSpec, publishedAt = new Date()): string {
  const endpoints = extractEndpoints(spec)
  const tags = [...new Set(endpoints.map((e) => e.tag))]

  const sidebar = tags
    .map((tag) => {
      const items = endpoints
        .filter((e) => e.tag === tag)
        .map(
          (e) =>
            `<a class="nav-item" href="#${escapeHtml(`${tag}-${e.method}-${e.path}`.replace(/[^a-zA-Z0-9_-]/g, '-'))}">
              <span class="method-pill method-${e.method.toLowerCase()}">${e.method}</span>
              <span class="nav-path">${escapeHtml(e.path)}</span>
            </a>`
        )
        .join('')
      return `<div class="nav-group"><div class="nav-group-title">${escapeHtml(tag)}</div>${items}</div>`
    })
    .join('')

  const cards = endpoints
    .map((e) => {
      const id = escapeHtml(`${e.tag}-${e.method}-${e.path}`.replace(/[^a-zA-Z0-9_-]/g, '-'))
      const colors = METHOD_COLORS[e.method] ?? METHOD_COLORS.GET
      return `
        <article class="endpoint-card" id="${id}">
          <div class="endpoint-header">
            <span class="method-badge" style="background:${colors.bg};color:${colors.text}">${e.method}</span>
            <code class="endpoint-path">${escapeHtml(e.path)}</code>
          </div>
          <h3 class="endpoint-title">${escapeHtml(e.summary)}</h3>
          ${e.description ? `<p class="endpoint-desc">${escapeHtml(e.description)}</p>` : ''}
          <div class="endpoint-meta">
            <span class="meta-tag">${escapeHtml(e.tag)}</span>
            <span class="meta-response">Response: 200 OK</span>
          </div>
        </article>`
    })
    .join('')

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(spec.info.title)} — API Documentation</title>
  <style>
    :root {
      --bg: #0f172a;
      --sidebar: #1e293b;
      --card: #ffffff;
      --text: #0f172a;
      --muted: #64748b;
      --border: #e2e8f0;
      --accent: #2563eb;
      --hero-from: #2563eb;
      --hero-to: #7c3aed;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 100%;
      background: #f8fafc;
      color: var(--text);
      line-height: 1.6;
    }
    .layout { display: flex; min-height: 100vh; }
    .sidebar {
      width: 300px;
      background: var(--sidebar);
      color: #e2e8f0;
      padding: 24px 16px;
      overflow-y: auto;
      position: sticky;
      top: 0;
      height: 100vh;
      flex-shrink: 0;
    }
    .sidebar-brand { font-size: 14px; font-weight: 700; color: #fff; margin-bottom: 4px; }
    .sidebar-sub { font-size: 11px; color: #94a3b8; margin-bottom: 24px; }
    .nav-group { margin-bottom: 20px; }
    .nav-group-title {
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: #64748b;
      margin-bottom: 8px;
      padding: 0 8px;
    }
    .nav-item {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px;
      border-radius: 8px;
      text-decoration: none;
      color: #cbd5e1;
      font-size: 12px;
      margin-bottom: 2px;
      transition: background 0.15s;
    }
    .nav-item:hover { background: rgba(255,255,255,0.06); color: #fff; }
    .method-pill {
      font-size: 9px;
      font-weight: 800;
      padding: 2px 6px;
      border-radius: 4px;
      flex-shrink: 0;
    }
    .method-get { background: #166534; color: #dcfce7; }
    .method-post { background: #1e40af; color: #dbeafe; }
    .method-put { background: #92400e; color: #fef3c7; }
    .method-patch { background: #6b21a8; color: #f3e8ff; }
    .method-delete { background: #991b1b; color: #fee2e2; }
    .nav-path { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-family: ui-monospace, monospace; }
    .main { flex: 1; min-width: 0; }
    .hero {
      background: linear-gradient(135deg, var(--hero-from), var(--hero-to));
      color: white;
      padding: 48px 40px;
    }
    .hero-badge {
      display: inline-block;
      background: rgba(255,255,255,0.15);
      padding: 4px 12px;
      border-radius: 999px;
      font-size: 12px;
      margin-bottom: 16px;
    }
    .hero h1 { font-size: 36px; font-weight: 800; margin-bottom: 12px; letter-spacing: -0.02em; }
    .hero p { font-size: 16px; opacity: 0.9; max-width: 640px; }
    .hero-meta { margin-top: 20px; font-size: 12px; opacity: 0.75; }
    .content { padding: 32px 40px 64px; max-width: 900px; }
    .stats {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 16px;
      margin-bottom: 32px;
    }
    .stat {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 16px;
      padding: 20px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.04);
    }
    .stat-value { font-size: 28px; font-weight: 800; color: var(--accent); }
    .stat-label { font-size: 12px; color: var(--muted); margin-top: 4px; }
    .endpoint-card {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 16px;
      padding: 24px;
      margin-bottom: 16px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.04);
      scroll-margin-top: 24px;
    }
    .endpoint-header { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; flex-wrap: wrap; }
    .method-badge {
      font-size: 12px;
      font-weight: 800;
      padding: 4px 10px;
      border-radius: 8px;
      letter-spacing: 0.04em;
    }
    .endpoint-path {
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      font-size: 15px;
      font-weight: 600;
      color: #1e293b;
    }
    .endpoint-title { font-size: 18px; font-weight: 700; margin-bottom: 8px; }
    .endpoint-desc { color: var(--muted); font-size: 14px; margin-bottom: 12px; }
    .endpoint-meta { display: flex; gap: 8px; flex-wrap: wrap; }
    .meta-tag, .meta-response {
      font-size: 11px;
      padding: 4px 10px;
      border-radius: 999px;
      background: #f1f5f9;
      color: #475569;
    }
    .footer {
      padding: 24px 40px;
      border-top: 1px solid var(--border);
      font-size: 12px;
      color: var(--muted);
      text-align: center;
    }
    @media (max-width: 900px) {
      .layout { flex-direction: column; }
      .sidebar { width: 100%; height: auto; position: relative; }
      .stats { grid-template-columns: 1fr; }
      .hero, .content { padding-left: 24px; padding-right: 24px; }
    }
  </style>
</head>
<body>
  <div class="layout">
    <aside class="sidebar">
      <div class="sidebar-brand">${escapeHtml(spec.info.title)}</div>
      <div class="sidebar-sub">OpenAPI ${escapeHtml(spec.openapi)} · v${escapeHtml(spec.info.version)}</div>
      ${sidebar}
    </aside>
    <div class="main">
      <header class="hero">
        <div class="hero-badge">Published from Git · ${APP_NAME}</div>
        <h1>${escapeHtml(spec.info.title)}</h1>
        <p>${escapeHtml(spec.info.description ?? 'Interactive API reference generated from your OpenAPI specification.')}</p>
        <div class="hero-meta">Generated ${publishedAt.toISOString()} · ${endpoints.length} endpoint(s)</div>
      </header>
      <div class="content">
        <div class="stats">
          <div class="stat"><div class="stat-value">${endpoints.length}</div><div class="stat-label">Endpoints</div></div>
          <div class="stat"><div class="stat-value">${tags.length}</div><div class="stat-label">Groups</div></div>
          <div class="stat"><div class="stat-value">${spec.info.version}</div><div class="stat-label">Version</div></div>
        </div>
        ${cards || '<p>No endpoints defined in the specification.</p>'}
      </div>
      <footer class="footer">Generated by ${APP_NAME} · Host this file on GitHub Pages from the <code>docs/</code> folder</footer>
    </div>
  </div>
</body>
</html>`
}

function endpointAnchor(e: DetailedDocEndpoint): string {
  return escapeHtml(`${e.tag}-${e.method}-${e.id}`.replace(/[^a-zA-Z0-9_-]/g, '-'))
}

function renderKeyValueTable(rows: { key: string; value: string; description?: string }[], emptyLabel: string): string {
  if (!rows.length) {
    return `<p class="section-empty">${escapeHtml(emptyLabel)}</p>`
  }
  const hasDescription = rows.some((r) => r.description?.trim())
  const head = hasDescription
    ? '<thead><tr><th>Key</th><th>Value</th><th>Description</th></tr></thead>'
    : '<thead><tr><th>Key</th><th>Value</th></tr></thead>'
  const body = rows
    .map((r) => {
      const descCell = hasDescription
        ? `<td class="desc-cell">${r.description?.trim() ? escapeHtml(r.description) : '<span class="muted-dash">—</span>'}</td>`
        : ''
      return `<tr><td><code>${escapeHtml(r.key)}</code></td><td><code>${escapeHtml(r.value)}</code></td>${descCell}</tr>`
    })
    .join('')
  return `<table class="kv-table">${head}<tbody>${body}</tbody></table>`
}

function renderAuthorizationSection(auth: DetailedDocEndpoint['authorization']): string {
  if (auth.type === 'none' || !auth.fields.length) {
    return `<p class="section-empty">No authorization configured</p>`
  }
  const note = auth.note
    ? `<p class="auth-note">${escapeHtml(auth.note)}</p>`
    : ''
  return `
    <div class="auth-block">
      <div class="auth-type-label">${escapeHtml(auth.label)}</div>
      ${renderKeyValueTable(auth.fields, '')}
      ${note}
    </div>`
}

function renderCodeBlock(label: string, code: string, lang = ''): string {
  if (!code?.trim()) return ''
  return `
    <div class="code-section">
      ${label ? `<div class="code-label">${escapeHtml(label)}</div>` : ''}
      <pre class="code-block${lang ? ` lang-${lang}` : ''}"><code>${escapeHtml(code)}</code></pre>
    </div>`
}

function renderRichEndpointCard(e: DetailedDocEndpoint): string {
  const id = endpointAnchor(e)
  const colors = METHOD_COLORS[e.method] ?? METHOD_COLORS.GET
  const hasBody = Boolean(e.requestBody?.trim()) && e.bodyType !== 'none'

  return `
    <details class="endpoint-card" id="${id}">
      <summary class="endpoint-summary">
        <span class="collapse-chevron" aria-hidden="true">›</span>
        <span class="method-badge" style="background:${colors.bg};color:${colors.text}">${e.method}</span>
        <code class="endpoint-path">${escapeHtml(e.path)}</code>
        <span class="endpoint-title">${escapeHtml(e.name)}</span>
      </summary>
      <div class="endpoint-body">
        <div class="endpoint-meta">
          <span class="meta-tag">Auth: ${escapeHtml(e.authSummary)}</span>
        </div>
        <div class="detail-section">
          <h4 class="section-title">URL</h4>
          <pre class="code-block inline-url"><code>${escapeHtml(e.url)}</code></pre>
        </div>
        <div class="detail-section">
          <h4 class="section-title">Query Parameters</h4>
          ${renderKeyValueTable(e.queryParams, 'No query parameters')}
        </div>
        <div class="detail-section">
          <h4 class="section-title">Authorization</h4>
          ${renderAuthorizationSection(e.authorization)}
        </div>
        <div class="detail-section">
          <h4 class="section-title">Headers</h4>
          ${renderKeyValueTable(e.headers, 'No custom headers')}
        </div>
        <div class="detail-section">
          <h4 class="section-title">Request Body${hasBody ? ` <span class="body-type">${escapeHtml(e.bodyType)}</span>` : ''}</h4>
          ${
            hasBody
              ? renderCodeBlock('', e.requestBody, e.bodyType === 'json' ? 'json' : '')
              : `<p class="section-empty">${['GET', 'HEAD'].includes(e.method) ? 'No request body' : 'No body configured'}</p>`
          }
        </div>
        ${renderCodeBlock('Request Sample (cURL)', e.requestExample)}
        ${renderCodeBlock('Response Sample', e.responseExample, 'json')}
      </div>
    </details>`
}

function renderCollectionGroup(tag: string, endpoints: DetailedDocEndpoint[]): string {
  const count = endpoints.length
  return `
    <details class="collection-group">
      <summary class="collection-summary">
        <span class="collapse-chevron" aria-hidden="true">›</span>
        <span class="collection-name">${escapeHtml(tag)}</span>
        <span class="collection-count">${count} endpoint${count === 1 ? '' : 's'}</span>
      </summary>
      <div class="collection-endpoints">
        ${endpoints.map(renderRichEndpointCard).join('')}
      </div>
    </details>`
}

function renderEnvironmentsSection(doc: ApiDocumentation): string {
  if (!doc.environments.length) {
    return `<section class="env-section" id="environments">
      <h2 class="section-heading">Environments</h2>
      <p class="section-empty">No environments configured. Add <code>BASE_URL</code> and other variables in ${APP_NAME}.</p>
    </section>`
  }

  const cards = doc.environments
    .map((env) => {
      const vars = env.variables.filter((v) => v.key?.trim())
      const rows =
        vars.length > 0
          ? vars
              .map((v) => {
                const display = v.secret ? '••••••••' : v.value
                return `<tr><td><code>${escapeHtml(v.key)}</code></td><td><code>${escapeHtml(display)}</code>${v.secret ? ' <span class="secret-badge">secret</span>' : ''}</td></tr>`
              })
              .join('')
          : '<tr><td colspan="2" class="section-empty">No variables</td></tr>'

      return `
        <div class="env-card">
          <div class="env-card-header"><span class="env-dot"></span><strong>${escapeHtml(env.name)}</strong></div>
          <table class="kv-table">
            <thead><tr><th>Variable</th><th>Value</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>`
    })
    .join('')

  return `
    <section class="env-section" id="environments">
      <h2 class="section-heading">Environments</h2>
      <p class="section-intro">Variables for URL/header substitution. Base URL: <code>${escapeHtml(doc.baseUrl)}</code></p>
      <div class="env-grid">${cards}</div>
    </section>`
}

const RICH_DOC_STYLES = `
    .detail-section { margin-top: 16px; padding-top: 16px; border-top: 1px solid #f1f5f9; }
    .section-title { font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: var(--muted); margin-bottom: 10px; }
    .body-type { font-size: 10px; font-weight: 600; padding: 2px 8px; border-radius: 4px; background: #dbeafe; color: #1e40af; text-transform: lowercase; margin-left: 6px; }
    .section-empty { font-size: 13px; color: var(--muted); font-style: italic; }
    .section-intro { font-size: 14px; color: var(--muted); margin-bottom: 16px; }
    .section-heading { font-size: 22px; font-weight: 800; margin-bottom: 8px; }
    .env-section { margin-bottom: 40px; scroll-margin-top: 24px; }
    .env-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 16px; }
    .env-card { background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 16px; }
    .env-card-header { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; font-size: 15px; }
    .env-dot { width: 10px; height: 10px; border-radius: 50%; background: #22c55e; }
    .kv-table { width: 100%; border-collapse: collapse; font-size: 13px; }
    .kv-table th { text-align: left; padding: 8px 10px; background: #f8fafc; border-bottom: 1px solid var(--border); font-size: 11px; text-transform: uppercase; color: var(--muted); }
    .kv-table td { padding: 8px 10px; border-bottom: 1px solid #f1f5f9; vertical-align: top; word-break: break-word; }
    .kv-table code { font-size: 12px; }
    .desc-cell { color: var(--muted); font-size: 12px; }
    .muted-dash { color: #cbd5e1; }
    .auth-block { background: #f8fafc; border: 1px solid var(--border); border-radius: 8px; padding: 12px 14px; }
    .auth-type-label { font-size: 13px; font-weight: 600; margin-bottom: 10px; color: var(--text); }
    .auth-note { font-size: 12px; color: var(--muted); margin-top: 10px; font-style: italic; }
    .secret-badge { font-size: 10px; background: #fef3c7; color: #92400e; padding: 1px 6px; border-radius: 4px; margin-left: 4px; }
    .code-section { margin-top: 12px; }
    .code-label { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: var(--muted); margin-bottom: 6px; }
    .code-block { background: #0f172a; color: #e2e8f0; padding: 16px; border-radius: 10px; overflow-x: auto; font-family: ui-monospace, Menlo, monospace; font-size: 12px; line-height: 1.5; white-space: pre-wrap; word-break: break-word; }
    .inline-url { margin-top: 0; }
    .nav-env { margin-bottom: 16px; font-weight: 600; color: #93c5fd; }
    .endpoint-meta { margin-bottom: 16px; }
    .endpoint-card { margin-bottom: 12px; border: 1px solid var(--border); border-radius: 12px; background: var(--card); overflow: hidden; scroll-margin-top: 24px; }
    .endpoint-summary, .collection-summary { display: flex; align-items: center; gap: 10px; padding: 14px 16px; cursor: pointer; list-style: none; user-select: none; }
    .endpoint-summary::-webkit-details-marker, .collection-summary::-webkit-details-marker { display: none; }
    .endpoint-summary:hover, .collection-summary:hover { background: #f8fafc; }
    .endpoint-body { padding: 0 20px 20px; border-top: 1px solid #f1f5f9; }
    .collection-group { margin-bottom: 16px; border: 1px solid var(--border); border-radius: 16px; background: var(--card); overflow: hidden; }
    .collection-summary { padding: 16px 18px; background: #f8fafc; border-bottom: 1px solid transparent; }
    .collection-group[open] > .collection-summary { border-bottom-color: var(--border); }
    .collection-name { font-size: 16px; font-weight: 700; flex: 1; }
    .collection-count { font-size: 12px; color: var(--muted); background: #e2e8f0; padding: 2px 10px; border-radius: 999px; }
    .collection-endpoints { padding: 12px; display: flex; flex-direction: column; gap: 8px; }
    .collapse-chevron { color: var(--muted); font-size: 18px; line-height: 1; transition: transform 0.15s ease; flex-shrink: 0; width: 14px; text-align: center; }
    details[open] > summary .collapse-chevron { transform: rotate(90deg); }
    .nav-group details { margin-bottom: 8px; }
    .nav-group summary.nav-group-title { cursor: pointer; list-style: none; display: flex; align-items: center; gap: 6px; }
    .nav-group summary.nav-group-title::-webkit-details-marker { display: none; }
    .nav-group-items { padding-left: 4px; }
    
`

export function generateRichApiDocsHtml(doc: ApiDocumentation, publishedAt = new Date()): string {
  const tags = [...new Set(doc.endpoints.map((e) => e.tag))]

  const sidebar =
    (doc.environments.length ? `<a class="nav-item nav-env" href="#environments">Environments</a>` : '') +
    tags
      .map((tag) => {
        const items = doc.endpoints
          .filter((e) => e.tag === tag)
          .map(
            (e) =>
              `<a class="nav-item" href="#${endpointAnchor(e)}">
              <span class="method-pill method-${e.method.toLowerCase()}">${e.method}</span>
              <span class="nav-path">${escapeHtml(e.name)}</span>
            </a>`
          )
          .join('')
        return `<details class="nav-group"><summary class="nav-group-title"><span class="collapse-chevron">›</span>${escapeHtml(tag)}</summary><div class="nav-group-items">${items}</div></details>`
      })
      .join('')

  const endpointGroups = tags
    .map((tag) => renderCollectionGroup(tag, doc.endpoints.filter((e) => e.tag === tag)))
    .join('')

  const body = `${renderEnvironmentsSection(doc)}<div id="endpoints">${endpointGroups || '<p>No endpoints in this project.</p>'}</div>`

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(doc.title)} — API Documentation</title>
  <style>
    :root { --sidebar: #1e293b; --card: #ffffff; --text: #0f172a; --muted: #64748b; --border: #e2e8f0; --accent: #2563eb; --hero-from: #2563eb; --hero-to: #7c3aed; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 100%; background: #f8fafc; color: var(--text); line-height: 1.6; }
    .layout { display: flex; min-height: 100vh; }
    .sidebar { width: 300px; background: var(--sidebar); color: #e2e8f0; padding: 24px 16px; overflow-y: auto; position: sticky; top: 0; height: 100vh; flex-shrink: 0; }
    .sidebar-brand { font-size: 14px; font-weight: 700; color: #fff; margin-bottom: 4px; }
    .sidebar-sub { font-size: 11px; color: #94a3b8; margin-bottom: 24px; }
    .nav-group { margin-bottom: 20px; }
    .nav-group-title { font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; color: #64748b; margin-bottom: 8px; padding: 0 8px; }
    .nav-item { display: flex; align-items: center; gap: 8px; padding: 8px; border-radius: 8px; text-decoration: none; color: #cbd5e1; font-size: 12px; margin-bottom: 2px; }
    .nav-item:hover { background: rgba(255,255,255,0.06); color: #fff; }
    .method-pill { font-size: 9px; font-weight: 800; padding: 2px 6px; border-radius: 4px; flex-shrink: 0; }
    .method-get { background: #166534; color: #dcfce7; }
    .method-post { background: #1e40af; color: #dbeafe; }
    .method-put { background: #92400e; color: #fef3c7; }
    .method-patch { background: #6b21a8; color: #f3e8ff; }
    .method-delete { background: #991b1b; color: #fee2e2; }
    .nav-path { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-family: ui-monospace, monospace; }
    .main { flex: 1; min-width: 0; }
    .hero { background: linear-gradient(135deg, var(--hero-from), var(--hero-to)); color: white; padding: 48px 40px; }
    .hero-badge { display: inline-block; background: rgba(255,255,255,0.15); padding: 4px 12px; border-radius: 999px; font-size: 12px; margin-bottom: 16px; }
    .hero h1 { font-size: 36px; font-weight: 800; margin-bottom: 12px; }
    .hero p { font-size: 16px; opacity: 0.9; max-width: 640px; }
    .hero-meta { margin-top: 20px; font-size: 12px; opacity: 0.75; }
    .content { padding: 32px 40px 64px; }
    .stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-bottom: 32px; }
    .stat { background: var(--card); border: 1px solid var(--border); border-radius: 16px; padding: 20px; }
    .stat-value { font-size: 28px; font-weight: 800; color: var(--accent); }
    .stat-label { font-size: 12px; color: var(--muted); margin-top: 4px; }
    .method-badge { font-size: 12px; font-weight: 800; padding: 4px 10px; border-radius: 8px; flex-shrink: 0; }
    .endpoint-path { font-family: ui-monospace, monospace; font-size: 14px; font-weight: 600; flex-shrink: 0; }
    .endpoint-title { font-size: 15px; font-weight: 600; flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .meta-tag { font-size: 11px; padding: 4px 10px; border-radius: 999px; background: #f1f5f9; color: #475569; }
    .footer { padding: 24px 40px; border-top: 1px solid var(--border); font-size: 12px; color: var(--muted); text-align: center; }
    ${RICH_DOC_STYLES}
    @media (max-width: 900px) { .layout { flex-direction: column; } .sidebar { width: 100%; height: auto; position: relative; } .stats { grid-template-columns: 1fr; } }
  </style>
</head>
<body>
  <div class="layout">
    <aside class="sidebar">
      <div class="sidebar-brand">${escapeHtml(doc.title)}</div>
      <div class="sidebar-sub">OpenAPI 3.0.3 · v${escapeHtml(doc.version)}</div>
      ${sidebar}
    </aside>
    <div class="main">
      <header class="hero">
        <div class="hero-badge">Published from ${APP_NAME}</div>
        <h1>${escapeHtml(doc.title)}</h1>
        <p>${escapeHtml(doc.description || 'API reference with request/response samples and environment variables.')}</p>
        <div class="hero-meta">Generated ${publishedAt.toISOString()} · ${doc.endpoints.length} endpoint(s)</div>
      </header>
      <div class="content">
        <div class="stats">
          <div class="stat"><div class="stat-value">${doc.endpoints.length}</div><div class="stat-label">Endpoints</div></div>
          <div class="stat"><div class="stat-value">${tags.length}</div><div class="stat-label">Collections</div></div>
          <div class="stat"><div class="stat-value">${doc.environments.length}</div><div class="stat-label">Environments</div></div>
        </div>
        ${body}
      </div>
      <footer class="footer">Generated by ${APP_NAME}</footer>
    </div>
  </div>
  <script>
    function openEndpointFromHash() {
      const hash = location.hash;
      if (!hash) return;
      const target = document.querySelector(hash);
      if (!target) return;
      if (target.tagName === 'DETAILS') target.open = true;
      target.closest('details.collection-group')?.setAttribute('open', '');
    }
    document.querySelectorAll('a[href^="#"]').forEach((link) => {
      link.addEventListener('click', () => setTimeout(openEndpointFromHash, 0));
    });
    window.addEventListener('load', openEndpointFromHash);
  </script>
</body>
</html>`
}
