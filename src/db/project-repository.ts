import { randomUUID } from 'crypto'
import { getDatabase, getDbPath, seedDefaultEnvVars } from './database'
import { listEnvironments } from './environment-repository'
import { assertCanCreateProject } from '../plan-limits'

export interface ProjectRow {
  id: string
  name: string
  description: string
  created_at: number
  updated_at: number
}

export interface ProjectSummary {
  id: string
  name: string
  description: string
  collectionCount: number
  requestCount: number
  createdAt: number
  updatedAt: number
}

export interface CollectionDto {
  id: string
  name: string
  protocol: string
  requests: ApiRequestDto[]
}

export interface ApiRequestDto {
  id: string
  name: string
  method: string
  url: string
  protocol: string
  requestConfig?: string
}

export interface ProjectFull {
  id: string
  name: string
  description: string
  collections: CollectionDto[]
  createdAt: number
  updatedAt: number
}

export interface EnvVariableDto {
  id: string
  key: string
  value: string
  secret: boolean
}

export function listProjects(): ProjectSummary[] {
  const db = getDatabase()
  const rows = db.prepare(`
    SELECT p.*,
      (SELECT COUNT(*) FROM collections c WHERE c.project_id = p.id) AS collection_count,
      (SELECT COUNT(*) FROM api_requests r
        JOIN collections c ON r.collection_id = c.id
        WHERE c.project_id = p.id) AS request_count
    FROM projects p
    ORDER BY p.updated_at DESC
  `).all() as (ProjectRow & { collection_count: number; request_count: number })[]

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description,
    collectionCount: r.collection_count,
    requestCount: r.request_count,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }))
}

export function getProjectById(id: string): ProjectFull | null {
  const db = getDatabase()
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as ProjectRow | undefined
  if (!project) return null

  const collections = db.prepare(
    'SELECT * FROM collections WHERE project_id = ? ORDER BY sort_order'
  ).all(project.id) as { id: string; name: string; protocol?: string }[]

  const getRequests = db.prepare(
    'SELECT * FROM api_requests WHERE collection_id = ? ORDER BY sort_order'
  )

  return {
    id: project.id,
    name: project.name,
    description: project.description,
    createdAt: project.created_at,
    updatedAt: project.updated_at,
    collections: collections.map((col) => ({
      id: col.id,
      name: col.name,
      protocol: col.protocol ?? 'http',
      requests: (getRequests.all(col.id) as ApiRequestDto[]).map((r) => ({
        id: r.id,
        name: r.name,
        method: r.method,
        url: r.url,
        protocol: r.protocol ?? 'http',
        requestConfig: (r as { request_config?: string }).request_config ?? '{}',
      })),
    })),
  }
}

export function createProject(name: string, description = ''): ProjectFull {
  assertCanCreateProject()

  const db = getDatabase()
  const id = randomUUID()
  const now = Date.now()

  db.prepare(
    'INSERT INTO projects (id, name, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?)'
  ).run(id, name.trim(), description.trim(), now, now)

  seedDefaultEnvVars(id)

  return getProjectById(id)!
}

export function updateProject(id: string, data: { name?: string; description?: string }): ProjectFull | null {
  const db = getDatabase()
  const existing = db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as ProjectRow | undefined
  if (!existing) return null

  const name = data.name?.trim() ?? existing.name
  const description = data.description ?? existing.description
  const now = Date.now()

  db.prepare('UPDATE projects SET name = ?, description = ?, updated_at = ? WHERE id = ?').run(
    name, description, now, id
  )

  return getProjectById(id)
}

export function deleteProject(id: string): boolean {
  const db = getDatabase()
  const result = db.prepare('DELETE FROM projects WHERE id = ?').run(id)
  return result.changes > 0
}

export function getEnvVariables(projectId: string, environment: string): EnvVariableDto[] {
  const db = getDatabase()
  const rows = db.prepare(
    'SELECT * FROM env_variables WHERE project_id = ? AND environment = ? ORDER BY key'
  ).all(projectId, environment) as { id: string; key: string; value: string; is_secret: number }[]

  return rows.map((r) => ({
    id: r.id,
    key: r.key,
    value: r.value,
    secret: r.is_secret === 1,
  }))
}

export function getAllEnvVariablesForProject(projectId: string): Record<string, EnvVariableDto[]> {
  const envs = listEnvironments(projectId)
  const result: Record<string, EnvVariableDto[]> = {}
  for (const env of envs) {
    result[env.id] = getEnvVariables(projectId, env.id)
  }
  return result
}

export function upsertEnvVariable(
  projectId: string,
  environment: string,
  key: string,
  value: string,
  secret = false
): EnvVariableDto {
  const db = getDatabase()
  const existing = db.prepare(
    'SELECT id FROM env_variables WHERE project_id = ? AND environment = ? AND key = ?'
  ).get(projectId, environment, key) as { id: string } | undefined

  if (existing) {
    db.prepare('UPDATE env_variables SET value = ?, is_secret = ? WHERE id = ?').run(
      value, secret ? 1 : 0, existing.id
    )
    return { id: existing.id, key, value, secret }
  }

  const id = randomUUID()
  db.prepare(
    'INSERT INTO env_variables (id, project_id, environment, key, value, is_secret) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(id, projectId, environment, key, value, secret ? 1 : 0)

  return { id, key, value, secret }
}

export function deleteEnvVariable(projectId: string, environment: string, key: string): boolean {
  const db = getDatabase()
  const result = db.prepare(
    'DELETE FROM env_variables WHERE project_id = ? AND environment = ? AND key = ?'
  ).run(projectId, environment, key)
  return result.changes > 0
}

export function getSetting(key: string): string | null {
  const db = getDatabase()
  const row = db.prepare('SELECT value FROM app_settings WHERE key = ?').get(key) as { value: string } | undefined
  return row?.value ?? null
}

export function setSetting(key: string, value: string): void {
  const db = getDatabase()
  db.prepare('INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, value)
}

export function getDbInfo(): { path: string; projectCount: number } {
  const db = getDatabase()
  const count = db.prepare('SELECT COUNT(*) as c FROM projects').get() as { c: number }
  return { path: getDbPath(), projectCount: count.c }
}
