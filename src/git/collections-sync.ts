import { mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'
import { getProjectById } from '../db/project-repository'
import { buildHttpForgeJson, buildOpenApi, type ExportEnvironment } from '../export/export-service'
import type { CollectionDto, ProjectFull } from '../db/project-repository'
import { APP_NAME, APP_WEBSITE, COLLECTIONS_FILENAME } from '../branding'

function safeFilename(name: string): string {
  const slug = name.replace(/[^a-z0-9_-]+/gi, '-').replace(/^-|-$/g, '').toLowerCase()
  return slug || 'collection'
}

export function syncProjectDataToRepo(
  project: Pick<ProjectFull, 'id' | 'name' | 'description' | 'collections'>,
  repoPath: string,
  environments?: ExportEnvironment[]
): {
  collectionCount: number
  requestCount: number
} {
  mkdirSync(repoPath, { recursive: true })

  const payload = buildHttpForgeJson(project as ProjectFull, project.collections, environments)
  writeFileSync(join(repoPath, COLLECTIONS_FILENAME), JSON.stringify(payload, null, 2), 'utf-8')

  const openapi = buildOpenApi(project as ProjectFull, project.collections, environments)
  writeFileSync(join(repoPath, 'openapi.json'), JSON.stringify(openapi, null, 2), 'utf-8')

  const collectionsDir = join(repoPath, 'collections')
  mkdirSync(collectionsDir, { recursive: true })

  let requestCount = 0
  for (const col of project.collections) {
    requestCount += col.requests.length
    writeFileSync(
      join(collectionsDir, `${safeFilename(col.name)}.json`),
      JSON.stringify(
        {
          id: col.id,
          name: col.name,
          protocol: col.protocol,
          requests: col.requests,
        },
        null,
        2
      ),
      'utf-8'
    )
  }

  writeFileSync(
    join(repoPath, 'README.md'),
    `# ${project.name} — API Collections

Managed with [${APP_NAME}](${APP_WEBSITE}).

## Files

- \`${COLLECTIONS_FILENAME}\` — full project export (import this in ${APP_NAME})
- \`openapi.json\` — OpenAPI 3.0 specification for API docs
- \`collections/\` — one JSON file per collection for readable Git diffs
- \`docs/index.html\` — publish with **Publish API Docs** in ${APP_NAME}

Last synced: ${new Date().toISOString()}
`,
    'utf-8'
  )

  return {
    collectionCount: project.collections.length,
    requestCount,
  }
}

export function syncCollectionsToRepo(projectId: string, repoPath: string): {
  collectionCount: number
  requestCount: number
} {
  const project = getProjectById(projectId)
  if (!project) throw new Error('Project not found')
  return syncProjectDataToRepo(project, repoPath)
}
