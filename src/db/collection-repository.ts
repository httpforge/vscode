import { randomUUID } from 'crypto'

import { getDatabase } from './database'

import type { CollectionDto } from './project-repository'



function touchProject(projectId: string): void {

  getDatabase().prepare('UPDATE projects SET updated_at = ? WHERE id = ?').run(Date.now(), projectId)

}



export function createCollection(projectId: string, name: string, protocol = 'http'): CollectionDto {

  const db = getDatabase()

  const id = randomUUID()

  const maxOrder = db.prepare(

    'SELECT COALESCE(MAX(sort_order), -1) as m FROM collections WHERE project_id = ?'

  ).get(projectId) as { m: number }



  db.prepare(

    'INSERT INTO collections (id, project_id, name, protocol, sort_order) VALUES (?, ?, ?, ?, ?)'

  ).run(id, projectId, name.trim(), protocol, maxOrder.m + 1)



  touchProject(projectId)

  return { id, name: name.trim(), protocol, requests: [] }

}



export function updateCollection(

  projectId: string,

  collectionId: string,

  data: { name?: string }

): CollectionDto | null {

  const db = getDatabase()

  const existing = db.prepare(

    'SELECT * FROM collections WHERE id = ? AND project_id = ?'

  ).get(collectionId, projectId) as { id: string; name: string; protocol: string } | undefined



  if (!existing) return null



  const name = data.name?.trim() ?? existing.name

  db.prepare('UPDATE collections SET name = ? WHERE id = ?').run(name, collectionId)

  touchProject(projectId)



  return getCollectionById(collectionId)

}



export function deleteCollection(projectId: string, collectionId: string): boolean {

  const db = getDatabase()

  const result = db.prepare(

    'DELETE FROM collections WHERE id = ? AND project_id = ?'

  ).run(collectionId, projectId)



  if (result.changes > 0) touchProject(projectId)

  return result.changes > 0

}



export function getCollectionById(collectionId: string): CollectionDto | null {

  const db = getDatabase()

  const col = db.prepare('SELECT * FROM collections WHERE id = ?').get(collectionId) as

    | { id: string; name: string; protocol?: string }

    | undefined

  if (!col) return null



  const requests = db.prepare(

    'SELECT * FROM api_requests WHERE collection_id = ? ORDER BY sort_order'

  ).all(col.id) as { id: string; name: string; method: string; url: string; protocol?: string }[]



  return {

    id: col.id,

    name: col.name,

    protocol: col.protocol ?? 'http',

    requests: requests.map((r) => ({

      id: r.id,

      name: r.name,

      method: r.method,

      url: r.url,

      protocol: r.protocol ?? 'http',

    })),

  }

}



export function listCollectionsForProject(projectId: string): CollectionDto[] {

  const db = getDatabase()

  const collections = db.prepare(

    'SELECT * FROM collections WHERE project_id = ? ORDER BY sort_order'

  ).all(projectId) as { id: string; name: string; protocol?: string }[]



  const getRequests = db.prepare(

    'SELECT * FROM api_requests WHERE collection_id = ? ORDER BY sort_order'

  )



  return collections.map((col) => ({

    id: col.id,

    name: col.name,

    protocol: col.protocol ?? 'http',

    requests: (getRequests.all(col.id) as { id: string; name: string; method: string; url: string; protocol?: string }[]).map((r) => ({

      id: r.id,

      name: r.name,

      method: r.method,

      url: r.url,

      protocol: r.protocol ?? 'http',

    })),

  }))

}

