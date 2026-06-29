import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { getProjectById } from '../db/project-repository'
import { buildOpenApi } from '../export/export-service'
import { generateApiDocsHtml, type OpenApiSpec } from './api-docs-generator'
import { COLLECTIONS_FILENAME, LEGACY_COLLECTIONS_FILENAMES } from '../branding'
import { parseImportContent } from '../import/import-service'

export function loadOpenApiFromRepo(repoPath: string): OpenApiSpec | null {
  const openapiPath = join(repoPath, 'openapi.json')
  if (existsSync(openapiPath)) {
    return JSON.parse(readFileSync(openapiPath, 'utf-8')) as OpenApiSpec
  }

  for (const name of [COLLECTIONS_FILENAME, ...LEGACY_COLLECTIONS_FILENAMES]) {
    const collectionsPath = join(repoPath, name)
    if (!existsSync(collectionsPath)) continue

    const content = readFileSync(collectionsPath, 'utf-8')
    const collections = parseImportContent('json', content)
    const parsed = JSON.parse(content) as { project?: { name?: string; description?: string } }
    const projectName = parsed.project?.name ?? 'API Documentation'
    const projectDescription = parsed.project?.description ?? ''

    const paths: OpenApiSpec['paths'] = {}
    for (const col of collections) {
      for (const req of col.requests) {
        const path =
          req.url.replace(/\{\{[^}]+\}\}/g, '').replace(/^https?:\/\/[^/]+/, '') || '/'
        const normalized = path.startsWith('/') ? path : `/${path}`
        if (!paths[normalized]) paths[normalized] = {}
        paths[normalized][req.method.toLowerCase()] = {
          summary: req.name,
          tags: [col.name],
          responses: { '200': { description: 'OK' } },
        }
      }
    }

    return {
      openapi: '3.0.3',
      info: { title: projectName, version: '1.0.0', description: projectDescription },
      paths,
    }
  }

  return null
}

export function loadOpenApiFromProject(projectId: string): OpenApiSpec {
  const project = getProjectById(projectId)
  if (!project) throw new Error('Project not found')
  return buildOpenApi(project, project.collections) as OpenApiSpec
}

export function publishApiDocs(
  projectId: string,
  repoPath: string,
  source: 'repo' | 'project' = 'project'
): {
  htmlPath: string
  openapiPath: string
  endpointCount: number
  title: string
  publishedAt: string
} {
  const spec =
    source === 'repo'
      ? loadOpenApiFromRepo(repoPath) ?? loadOpenApiFromProject(projectId)
      : loadOpenApiFromProject(projectId)

  const publishedAt = new Date()
  const docsDir = join(repoPath, 'docs')
  mkdirSync(docsDir, { recursive: true })

  const openapiPath = join(repoPath, 'openapi.json')
  writeFileSync(openapiPath, JSON.stringify(spec, null, 2), 'utf-8')

  const htmlPath = join(docsDir, 'index.html')
  writeFileSync(htmlPath, generateApiDocsHtml(spec, publishedAt), 'utf-8')

  const endpointCount = Object.entries(spec.paths ?? {}).reduce(
    (n, [, methods]) => n + Object.keys(methods).filter((m) => m !== 'parameters').length,
    0
  )

  writeFileSync(
    join(docsDir, 'README.md'),
    `# API Documentation

Open \`index.html\` in a browser or enable **GitHub Pages** from the \`/docs\` folder.

- \`../openapi.json\` — OpenAPI 3.0 specification
- \`index.html\` — Beautiful static API reference

Last published: ${publishedAt.toISOString()}
`,
    'utf-8'
  )

  return {
    htmlPath,
    openapiPath,
    endpointCount,
    title: spec.info.title,
    publishedAt: publishedAt.toISOString(),
  }
}

export function getPublishedDocsPath(repoPath: string): string | null {
  const htmlPath = join(repoPath, 'docs', 'index.html')
  return existsSync(htmlPath) ? htmlPath : null
}
