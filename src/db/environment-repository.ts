import { randomUUID } from 'crypto'
import { getDatabase } from './database'
import { DEFAULT_ENV_VARS, envVarsForEnvironment } from './seed-data'

export interface EnvironmentDto {
  id: string
  name: string
  color: string
  sortOrder: number
}

export function listEnvironments(projectId: string): EnvironmentDto[] {
  const db = getDatabase()
  const rows = db.prepare(
    'SELECT * FROM project_environments WHERE project_id = ? ORDER BY sort_order, name'
  ).all(projectId) as { id: string; name: string; color: string; sort_order: number }[]

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    color: r.color,
    sortOrder: r.sort_order,
  }))
}

export function createEnvironment(projectId: string, name: string, color: string): EnvironmentDto {
  const db = getDatabase()
  const id = randomUUID()
  const maxOrder = db.prepare(
    'SELECT COALESCE(MAX(sort_order), -1) as m FROM project_environments WHERE project_id = ?'
  ).get(projectId) as { m: number }

  db.prepare(
    'INSERT INTO project_environments (id, project_id, name, color, sort_order) VALUES (?, ?, ?, ?, ?)'
  ).run(id, projectId, name.trim(), color, maxOrder.m + 1)

  return { id, name: name.trim(), color, sortOrder: maxOrder.m + 1 }
}

export function updateEnvironment(
  projectId: string,
  environmentId: string,
  data: { name?: string; color?: string }
): EnvironmentDto {
  const db = getDatabase()
  const env = listEnvironments(projectId).find((e) => e.id === environmentId)
  if (!env) throw new Error('Environment not found')

  const name = data.name?.trim() || env.name
  const color = data.color ?? env.color

  db.prepare(
    'UPDATE project_environments SET name = ?, color = ? WHERE id = ? AND project_id = ?'
  ).run(name, color, environmentId, projectId)

  return { ...env, name, color }
}

export function duplicateEnvironment(
  projectId: string,
  sourceEnvironmentId: string,
  name: string,
  color?: string
): EnvironmentDto {
  const db = getDatabase()
  const source = listEnvironments(projectId).find((e) => e.id === sourceEnvironmentId)
  if (!source) throw new Error('Source environment not found')

  const trimmedName = name.trim()
  if (!trimmedName) throw new Error('Environment name is required')

  const newColor = color ?? source.color
  const id = randomUUID()
  const maxOrder = db.prepare(
    'SELECT COALESCE(MAX(sort_order), -1) as m FROM project_environments WHERE project_id = ?'
  ).get(projectId) as { m: number }

  const sourceVars = db.prepare(
    'SELECT key, value, is_secret FROM env_variables WHERE project_id = ? AND environment = ? ORDER BY key'
  ).all(projectId, sourceEnvironmentId) as { key: string; value: string; is_secret: number }[]

  const insertEnv = db.prepare(
    'INSERT INTO project_environments (id, project_id, name, color, sort_order) VALUES (?, ?, ?, ?, ?)'
  )
  const insertVar = db.prepare(
    'INSERT INTO env_variables (id, project_id, environment, key, value, is_secret) VALUES (?, ?, ?, ?, ?, ?)'
  )

  db.transaction(() => {
    insertEnv.run(id, projectId, trimmedName, newColor, maxOrder.m + 1)
    for (const v of sourceVars) {
      insertVar.run(randomUUID(), projectId, id, v.key, v.value, v.is_secret)
    }
  })()

  return { id, name: trimmedName, color: newColor, sortOrder: maxOrder.m + 1 }
}

export function deleteEnvironment(projectId: string, environmentId: string): { success: boolean; fallbackEnvironmentId?: string } {
  const db = getDatabase()
  const envs = listEnvironments(projectId)
  if (envs.length <= 1) {
    throw new Error('Cannot delete the last environment')
  }

  const exists = envs.some((e) => e.id === environmentId)
  if (!exists) throw new Error('Environment not found')

  const deleteVars = db.prepare('DELETE FROM env_variables WHERE project_id = ? AND environment = ?')
  const deleteEnv = db.prepare('DELETE FROM project_environments WHERE id = ? AND project_id = ?')

  db.transaction(() => {
    deleteVars.run(projectId, environmentId)
    deleteEnv.run(environmentId, projectId)
  })()

  const remaining = listEnvironments(projectId)
  return { success: true, fallbackEnvironmentId: remaining[0]?.id }
}

function seedEnvironmentVars(projectId: string, environmentId: string): void {
  const db = getDatabase()
  const insert = db.prepare(
    'INSERT OR IGNORE INTO env_variables (id, project_id, environment, key, value, is_secret) VALUES (?, ?, ?, ?, ?, ?)'
  )
  for (const v of DEFAULT_ENV_VARS) {
    insert.run(randomUUID(), projectId, environmentId, v.key, v.value, v.secret ? 1 : 0)
  }
}

export function ensureDefaultEnvironments(projectId: string, defaults: { id: string; name: string; color: string }[]): void {
  const db = getDatabase()
  const insertEnv = db.prepare(
    'INSERT OR IGNORE INTO project_environments (id, project_id, name, color, sort_order) VALUES (?, ?, ?, ?, ?)'
  )
  const insertVar = db.prepare(
    'INSERT OR IGNORE INTO env_variables (id, project_id, environment, key, value, is_secret) VALUES (?, ?, ?, ?, ?, ?)'
  )

  db.transaction(() => {
    defaults.forEach((e, i) => {
      insertEnv.run(e.id, projectId, e.name, e.color, i)
      for (const v of envVarsForEnvironment(e.id)) {
        insertVar.run(randomUUID(), projectId, e.id, v.key, v.value, v.secret ? 1 : 0)
      }
    })
  })()
}
