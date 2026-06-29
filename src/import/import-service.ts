import { APP_NAME, EXPORT_FORMAT_KEY, isHttpForgeExport } from '../branding'
import { createCollection } from '../db/collection-repository'
import { createRequest } from '../db/request-repository'

export interface ImportRequest {
  name: string
  method: string
  url: string
  protocol?: string
}

export interface ImportCollection {
  name: string
  protocol?: string
  requests: ImportRequest[]
}

export interface ImportEnvironment {
  name: string
  color?: string
  variables?: { key: string; value: string; secret?: boolean }[]
}

export interface ImportResult {
  success: boolean
  canceled?: boolean
  collectionsCreated?: number
  requestsCreated?: number
  environmentsImported?: number
  collectionNames?: string[]
}

export function extractEnvironmentsFromExport(data: unknown): ImportEnvironment[] {
  if (!data || typeof data !== 'object') return []

  const doc = data as {
    environments?: {
      name?: string
      color?: string
      variables?: { key?: string; value?: string; secret?: boolean }[] | Record<string, string>
    }[]
  }

  if (!Array.isArray(doc.environments)) return []

  const results: ImportEnvironment[] = []
  for (const env of doc.environments) {
    const name = env.name?.trim()
    if (!name) continue

    let variables: { key: string; value: string; secret?: boolean }[] = []
    if (Array.isArray(env.variables)) {
      variables = env.variables
        .filter((v) => v.key?.trim())
        .map((v) => ({
          key: v.key!.trim(),
          value: v.value ?? '',
          secret: v.secret ?? false,
        }))
    } else if (env.variables && typeof env.variables === 'object') {
      variables = Object.entries(env.variables).map(([key, value]) => ({
        key,
        value: String(value ?? ''),
        secret: /token|key|secret|password/i.test(key),
      }))
    }

    results.push({ name, color: env.color, variables })
  }

  return results
}

const HTTP_METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE'])
const OPENAPI_METHODS = new Set(['get', 'post', 'put', 'patch', 'delete', 'head', 'options'])

function normalizeMethod(method: string): string {
  const upper = method.toUpperCase()
  return HTTP_METHODS.has(upper) ? upper : 'GET'
}

function extractPostmanUrl(url: unknown): string {
  if (typeof url === 'string') return url
  if (url && typeof url === 'object') {
    const u = url as { raw?: string; host?: string | string[]; path?: string | string[]; protocol?: string }
    if (typeof u.raw === 'string' && u.raw.trim()) return u.raw.trim()
    const host = Array.isArray(u.host) ? u.host.join('.') : u.host
    const path = Array.isArray(u.path) ? u.path.join('/') : u.path
    if (host && path) {
      const scheme = u.protocol ?? 'https'
      return `${scheme}://${host}/${String(path).replace(/^\//, '')}`
    }
  }
  return '{{BASE_URL}}'
}

function flattenPostmanItems(items: unknown[], folderPrefix?: string): ImportRequest[] {
  const results: ImportRequest[] = []

  for (const item of items) {
    if (!item || typeof item !== 'object') continue
    const obj = item as {
      name?: string
      item?: unknown[]
      request?: { method?: string; url?: unknown }
    }

    if (Array.isArray(obj.item)) {
      const prefix = obj.name ? (folderPrefix ? `${folderPrefix} / ${obj.name}` : obj.name) : folderPrefix
      results.push(...flattenPostmanItems(obj.item, prefix))
      continue
    }

    if (obj.request) {
      const label = obj.name?.trim() || 'Request'
      results.push({
        name: folderPrefix ? `${folderPrefix} / ${label}` : label,
        method: normalizeMethod(obj.request.method ?? 'GET'),
        url: extractPostmanUrl(obj.request.url) || '{{BASE_URL}}',
        protocol: 'http',
      })
    }
  }

  return results
}

export function parsePostmanCollection(data: unknown): ImportCollection[] {
  if (!data || typeof data !== 'object') throw new Error('Invalid Postman collection file')

  const doc = data as { info?: { name?: string }; item?: unknown[] }
  const name = doc.info?.name?.trim() || 'Imported Postman Collection'
  const requests = flattenPostmanItems(doc.item ?? [])

  if (requests.length === 0) {
    throw new Error('No requests found in Postman collection')
  }

  return [{ name, protocol: 'http', requests }]
}

function normalizeSwaggerToOpenApi(data: Record<string, unknown>): Record<string, unknown> {
  if (!data.swagger) return data

  const doc = data as {
    swagger?: string
    basePath?: string
    paths?: Record<string, unknown>
    host?: string
    schemes?: string[]
    info?: unknown
  }

  const scheme = doc.schemes?.[0] ?? 'https'
  const host = doc.host ?? 'localhost'
  const basePath = doc.basePath ?? ''
  return {
    openapi: '3.0.0',
    info: doc.info ?? { title: 'Imported API', version: '1.0.0' },
    paths: doc.paths ?? {},
    servers: [{ url: `${scheme}://${host}${basePath}`.replace(/\/$/, '') || '{{BASE_URL}}' }],
  }
}

export function parseOpenApi(data: unknown): ImportCollection[] {
  if (!data || typeof data !== 'object') throw new Error('Invalid OpenAPI document')

  const normalized = normalizeSwaggerToOpenApi(data as Record<string, unknown>)
  const doc = normalized as {
    info?: { title?: string }
    paths?: Record<string, Record<string, unknown>>
    servers?: { url?: string }[]
  }

  const baseUrl = doc.servers?.[0]?.url?.trim() || '{{BASE_URL}}'
  const title = doc.info?.title?.trim() || 'OpenAPI Import'
  const requests: ImportRequest[] = []

  for (const [path, pathItem] of Object.entries(doc.paths ?? {})) {
    if (!pathItem || typeof pathItem !== 'object') continue

    for (const [method, operation] of Object.entries(pathItem)) {
      if (!OPENAPI_METHODS.has(method.toLowerCase())) continue
      if (!operation || typeof operation !== 'object') continue

      const op = operation as { summary?: string; operationId?: string }
      const fullPath = path.startsWith('/') ? path : `/${path}`
      const url = baseUrl.includes('{{') ? `${baseUrl}${fullPath}` : `${baseUrl.replace(/\/$/, '')}${fullPath}`

      requests.push({
        name: op.summary?.trim() || op.operationId?.trim() || `${method.toUpperCase()} ${fullPath}`,
        method: normalizeMethod(method),
        url,
        protocol: 'http',
      })
    }
  }

  if (requests.length === 0) {
    throw new Error('No HTTP operations found in OpenAPI document')
  }

  return [{ name: title, protocol: 'http', requests }]
}

export function parseHttpForgeJson(data: unknown): ImportCollection[] {
  if (!data || typeof data !== 'object') throw new Error(`Invalid ${APP_NAME} JSON`)

  const doc = data as {
    httpforge?: string
    apiwatch?: string
    apiforge?: string
    collections?: {
      name?: string
      protocol?: string
      requests?: { name?: string; method?: string; url?: string; protocol?: string }[]
    }[]
  }

  if (!isHttpForgeExport(doc as Record<string, unknown>) || !Array.isArray(doc.collections)) {
    throw new Error(`Not a valid ${APP_NAME} export file`)
  }

  const collections = doc.collections
    .map((col) => {
      const name = col.name?.trim() || 'Imported Collection'
      const protocol = col.protocol ?? 'http'
      const requests = (col.requests ?? []).map((req) => ({
        name: req.name?.trim() || 'Request',
        method: normalizeMethod(req.method ?? 'GET'),
        url: req.url?.trim() || '{{BASE_URL}}',
        protocol: req.protocol ?? protocol,
      }))
      return { name, protocol, requests }
    })
    .filter((col) => col.requests.length > 0)

  if (collections.length === 0) {
    throw new Error(`No collections with requests found in ${APP_NAME} file`)
  }

  return collections
}

/** @deprecated Use parseHttpForgeJson */
export const parseApiWatchJson = parseHttpForgeJson
/** @deprecated Use parseHttpForgeJson */
export const parseApiForgeJson = parseHttpForgeJson

export function parseJsonImport(data: unknown): ImportCollection[] {
  if (!data || typeof data !== 'object') throw new Error('Invalid JSON file')

  const doc = data as Record<string, unknown>

  if (isHttpForgeExport(doc)) return parseHttpForgeJson(data)

  const info = doc.info as { schema?: string } | undefined
  if (info?.schema?.includes('postman.com') || Array.isArray(doc.item)) {
    return parsePostmanCollection(data)
  }

  if (doc.openapi || doc.swagger || doc.paths) {
    return parseOpenApi(data)
  }

  if (Array.isArray(doc.collections)) {
    const collections = (doc.collections as ImportCollection[])
      .map((col) => ({
        name: col.name?.trim() || 'Imported Collection',
        protocol: col.protocol ?? 'http',
        requests: (col.requests ?? []).map((req) => ({
          name: req.name?.trim() || 'Request',
          method: normalizeMethod(req.method ?? 'GET'),
          url: req.url?.trim() || '{{BASE_URL}}',
          protocol: req.protocol ?? col.protocol ?? 'http',
        })),
      }))
      .filter((col) => col.requests.length > 0)

    if (collections.length === 0) throw new Error('No requests found in JSON collections')
    return collections
  }

  throw new Error(`Unsupported JSON format. Use Postman, OpenAPI, or ${APP_NAME} export.`)
}

function parseYamlContent(content: string): unknown {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { parse } = require('yaml') as typeof import('yaml');
    return parse(content);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`YAML parser failed: ${message}`);
  }
}

export function parseYamlImport(content: string): ImportCollection[] {
  const data = parseYamlContent(content)
  if (!data || typeof data !== 'object') throw new Error('Invalid YAML file')

  const doc = data as Record<string, unknown>
  if (doc.openapi || doc.swagger || doc.paths) {
    return parseOpenApi(data)
  }

  throw new Error('YAML file must be an OpenAPI / Swagger specification')
}

export function parseImportContent(format: string, content: string): ImportCollection[] {
  const trimmed = content.trim()
  if (!trimmed) throw new Error('File is empty')

  switch (format) {
    case 'postman':
      return parsePostmanCollection(JSON.parse(trimmed))
    case 'openapi':
      return parseOpenApi(JSON.parse(trimmed))
    case 'yaml':
      return parseYamlImport(trimmed)
    case 'json':
      return parseJsonImport(JSON.parse(trimmed))
    default:
      throw new Error(`Unsupported import format: ${format}`)
  }
}

export function importCollectionsIntoProject(
  projectId: string,
  collections: ImportCollection[]
): Omit<ImportResult, 'success' | 'canceled'> {
  let requestsCreated = 0
  const collectionNames: string[] = []

  for (const col of collections) {
    const name = col.name.trim() || 'Imported Collection'
    const protocol = col.protocol ?? 'http'
    const created = createCollection(projectId, name, protocol)
    collectionNames.push(created.name)

    for (const req of col.requests) {
      createRequest(
        projectId,
        created.id,
        req.name,
        req.method,
        req.url || '{{BASE_URL}}',
        req.protocol ?? protocol
      )
      requestsCreated++
    }
  }

  return {
    collectionsCreated: collectionNames.length,
    requestsCreated,
    collectionNames,
  }
}

export function importFileFilters(format: string): { name: string; extensions: string[] }[] {
  switch (format) {
    case 'postman':
      return [{ name: 'Postman Collection', extensions: ['json'] }]
    case 'openapi':
      return [{ name: 'OpenAPI', extensions: ['json'] }]
    case 'yaml':
      return [{ name: 'YAML', extensions: ['yaml', 'yml'] }]
    case 'json':
      return [{ name: 'JSON', extensions: ['json'] }]
    default:
      return [{ name: 'All Files', extensions: ['json', 'yaml', 'yml'] }]
  }
}
