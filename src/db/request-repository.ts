import { randomUUID } from 'crypto'
import { getDatabase } from './database'

export interface RequestDto {
  id: string
  name: string
  method: string
  url: string
  protocol: string
  requestConfig: string
}

const VALID_METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE'])
const VALID_PROTOCOLS = new Set(['http', 'graphql', 'soap', 'websocket', 'grpc', 'socketio', 'mqtt', 'ai', 'mcp'])

function touchProject(projectId: string): void {
  getDatabase().prepare('UPDATE projects SET updated_at = ? WHERE id = ?').run(Date.now(), projectId)
}

function assertCollectionInProject(projectId: string, collectionId: string): { protocol: string } {
  const row = getDatabase()
    .prepare('SELECT id, protocol FROM collections WHERE id = ? AND project_id = ?')
    .get(collectionId, projectId) as { id: string; protocol?: string } | undefined
  if (!row) throw new Error('Collection not found')
  return { protocol: row.protocol ?? 'http' }
}

function normalizeProtocol(protocol: string): string {
  const value = protocol.toLowerCase()
  return VALID_PROTOCOLS.has(value) ? value : 'http'
}

export function createRequest(
  projectId: string,
  collectionId: string,
  name: string,
  method: string,
  url: string,
  protocol = 'http'
): RequestDto {
  const trimmedName = name.trim()
  if (!trimmedName) throw new Error('Request name is required')

  const normalizedMethod = method.toUpperCase()
  if (!VALID_METHODS.has(normalizedMethod)) throw new Error('Invalid HTTP method')

  const normalizedProtocol = normalizeProtocol(protocol)
  const collection = assertCollectionInProject(projectId, collectionId)
  if (normalizeProtocol(collection.protocol) !== normalizedProtocol) {
    throw new Error(`Request protocol must match collection protocol (${collection.protocol})`)
  }

  const db = getDatabase()
  const id = randomUUID()
  const maxOrder = db.prepare(
    'SELECT COALESCE(MAX(sort_order), -1) as m FROM api_requests WHERE collection_id = ?'
  ).get(collectionId) as { m: number }

  db.prepare(
    'INSERT INTO api_requests (id, collection_id, name, method, url, protocol, sort_order, request_config) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(id, collectionId, trimmedName, normalizedMethod, url.trim(), normalizedProtocol, maxOrder.m + 1, '{}')

  touchProject(projectId)
  return { id, name: trimmedName, method: normalizedMethod, url: url.trim(), protocol: normalizedProtocol, requestConfig: '{}' }
}

export function updateRequest(
  projectId: string,
  requestId: string,
  data: {
    name?: string
    method?: string
    url?: string
    protocol?: string
    requestConfig?: string
  }
): RequestDto {
  const db = getDatabase()
  const row = db.prepare(`
    SELECT r.id, r.name, r.method, r.url, r.protocol, r.request_config
    FROM api_requests r
    JOIN collections c ON c.id = r.collection_id
    WHERE r.id = ? AND c.project_id = ?
  `).get(requestId, projectId) as {
    id: string
    name: string
    method: string
    url: string
    protocol: string
    request_config: string
  } | undefined

  if (!row) throw new Error('Request not found')

  const name = data.name !== undefined ? data.name.trim() : row.name
  if (!name) throw new Error('Request name is required')

  const method = data.method !== undefined ? data.method.toUpperCase() : row.method
  if (!VALID_METHODS.has(method)) throw new Error('Invalid HTTP method')

  const url = data.url !== undefined ? data.url.trim() : row.url
  const protocol = data.protocol !== undefined ? normalizeProtocol(data.protocol) : row.protocol
  const requestConfig = data.requestConfig !== undefined ? data.requestConfig : row.request_config

  db.prepare(
    'UPDATE api_requests SET name = ?, method = ?, url = ?, protocol = ?, request_config = ? WHERE id = ?'
  ).run(name, method, url, protocol, requestConfig, requestId)

  touchProject(projectId)
  return { id: requestId, name, method, url, protocol, requestConfig }
}

export function deleteRequest(projectId: string, requestId: string): boolean {
  const db = getDatabase()
  const row = db.prepare(`
    SELECT r.id
    FROM api_requests r
    JOIN collections c ON c.id = r.collection_id
    WHERE r.id = ? AND c.project_id = ?
  `).get(requestId, projectId) as { id: string } | undefined

  if (!row) throw new Error('Request not found')

  const result = db.prepare('DELETE FROM api_requests WHERE id = ?').run(requestId)
  if (result.changes > 0) touchProject(projectId)
  return result.changes > 0
}

function mapRequestRow(r: {
  id: string
  name: string
  method: string
  url: string
  protocol?: string
  request_config?: string
}): RequestDto {
  return {
    id: r.id,
    name: r.name,
    method: r.method,
    url: r.url,
    protocol: r.protocol ?? 'http',
    requestConfig: r.request_config ?? '{}',
  }
}

export { mapRequestRow }
