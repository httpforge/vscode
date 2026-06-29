import {
  APP_NAME,
  EXPORT_FORMAT_KEY,
} from '../branding'
import type { CollectionDto, ProjectFull } from '../db/project-repository'
import { parseRequestConfig } from '../domain/request-config'
type ExportCollection = CollectionDto

export interface ExportEnvironment {
  name: string
  color?: string
  variables: { key: string; value: string; secret?: boolean }[]
}

function postmanItems(collections: ExportCollection[]) {
  return collections.flatMap((col) =>
    col.requests.map((req) => ({
      name: req.name,
      request: {
        method: req.method,
        header: [],
        url: req.url,
      },
    }))
  )
}

export function buildPostmanCollection(
  projectName: string,
  collections: ExportCollection[],
  environments?: ExportEnvironment[]
) {
  const name = collections.length === 1 ? collections[0].name : `${projectName} Collection`
  const activeEnv = environments?.[0]
  return {
    info: {
      name,
      description: `Exported from ${APP_NAME} — ${projectName}`,
      schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
    },
    variable: (activeEnv?.variables ?? []).map((v) => ({
      key: v.key,
      value: v.value,
      type: v.secret ? 'secret' : 'default',
    })),
    item: postmanItems(collections),
  }
}

export function buildHttpForgeJson(
  project: ProjectFull,
  collections: ExportCollection[],
  environments?: ExportEnvironment[]
) {
  return {
    [EXPORT_FORMAT_KEY]: '1.0',
    exportedAt: new Date().toISOString(),
    project: {
      id: project.id,
      name: project.name,
      description: project.description,
    },
    environments: (environments ?? []).map((env) => ({
      name: env.name,
      color: env.color,
      variables: env.variables,
    })),
    collections: collections.map((c) => ({
      id: c.id,
      name: c.name,
      protocol: c.protocol,
      requests: c.requests,
    })),
  }
}

/** @deprecated Use buildHttpForgeJson */
export const buildApiWatchJson = buildHttpForgeJson
/** @deprecated Use buildHttpForgeJson */
export const buildApiForgeJson = buildHttpForgeJson

export function buildOpenApi(
  project: ProjectFull,
  collections: ExportCollection[],
  environments?: ExportEnvironment[]
) {
  const paths: Record<string, Record<string, unknown>> = {}
  for (const col of collections) {
    for (const req of col.requests) {
      const path = req.url.replace(/\{\{[^}]+\}\}/g, '').replace(/^https?:\/\/[^/]+/, '') || '/'
      const normalized = path.startsWith('/') ? path : `/${path}`
      if (!paths[normalized]) paths[normalized] = {}

      let config = parseRequestConfig(null)
      try {
        if (req.requestConfig) config = parseRequestConfig(JSON.parse(req.requestConfig))
      } catch {
        /* use default config */
      }

      const parameters = config.params
        .filter((p) => p.key?.trim() && p.enabled !== false)
        .map((p) => ({
          name: p.key.trim(),
          in: 'query',
          schema: { type: 'string' },
          example: p.value || undefined,
        }))

      const headerParams = config.headers
        .filter((h) => h.key?.trim() && h.enabled !== false)
        .map((h) => ({
          name: h.key.trim(),
          in: 'header',
          schema: { type: 'string' },
          example: h.value || undefined,
        }))

      const operation: Record<string, unknown> = {
        summary: req.name,
        tags: [col.name],
        parameters: [...parameters, ...headerParams],
        responses: {
          '200': {
            description: 'Successful response',
            content: {
              'application/json': {
                example: { id: 1, status: 'ok' },
              },
            },
          },
        },
      }

      if (config.body?.trim() && config.bodyType !== 'none' && !['GET', 'HEAD'].includes(req.method.toUpperCase())) {
        const mediaType =
          config.bodyType === 'json'
            ? 'application/json'
            : config.bodyType === 'xml'
              ? 'application/xml'
              : config.bodyType === 'form-urlencoded'
                ? 'application/x-www-form-urlencoded'
                : 'text/plain'

        let example: unknown = config.body
        if (config.bodyType === 'json') {
          try {
            example = JSON.parse(config.body)
          } catch {
            example = config.body
          }
        }

        operation.requestBody = {
          required: true,
          content: {
            [mediaType]: {
              example,
              schema: config.bodyType === 'json' ? { type: 'object' } : { type: 'string' },
            },
          },
        }
      }

      paths[normalized][req.method.toLowerCase()] = operation
    }
  }

  const baseUrl = environments?.[0]?.variables.find((v) => v.key === 'BASE_URL')?.value
  const servers = baseUrl ? [{ url: baseUrl.replace(/\/$/, '') }] : undefined

  return {
    openapi: '3.0.3',
    info: { title: project.name, version: '1.0.0', description: project.description },
    ...(servers ? { servers } : {}),
    paths,
  }
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function buildJMeterUserDefinedVariables(env: ExportEnvironment): string {
  const args = env.variables
    .map(
      (v) => `
          <elementProp name="${escapeXml(v.key)}" elementType="Argument">
            <stringProp name="Argument.name">${escapeXml(v.key)}</stringProp>
            <stringProp name="Argument.value">${escapeXml(v.value)}</stringProp>
            <stringProp name="Argument.metadata">=</stringProp>
          </elementProp>`
    )
    .join('')

  return `
        <Arguments guiclass="ArgumentsPanel" testclass="Arguments" testname="User Defined Variables — ${escapeXml(env.name)}" enabled="true">
          <collectionProp name="Arguments.arguments">${args}
          </collectionProp>
        </Arguments>
        <hashTree/>`
}

export function buildK6Script(
  projectName: string,
  collections: ExportCollection[],
  environments?: ExportEnvironment[]
) {
  const requests = collections.flatMap((c) => c.requests)
  const env = environments?.[0]
  const envLines = (env?.variables ?? [])
    .map((v) => `const ${v.key} = '${v.value.replace(/'/g, "\\'")}';`)
    .join('\n')
  const lines = requests.map(
    (r) => `  { method: '${r.method}', url: \`${r.url}\`, name: '${r.name.replace(/'/g, "\\'")}' }`
  )
  return `// k6 load test — exported from ${APP_NAME}
import http from 'k6/http';
import { check } from 'k6';

export const options = { vus: 10, duration: '30s' };

${envLines ? `// Environment: ${env?.name ?? 'default'}\n${envLines}\n` : ''}
const requests = [
${lines.join(',\n')}
];

export default function () {
  const req = requests[Math.floor(Math.random() * requests.length)];
  const res = http.request(req.method, req.url);
  check(res, { 'status is 2xx': (r) => r.status >= 200 && r.status < 300 });
}
`
}

export function buildJMeterPlan(
  projectName: string,
  collections: ExportCollection[],
  environments?: ExportEnvironment[]
) {
  const requests = collections.flatMap((c) => c.requests)
  const envBlock = environments?.[0] ? buildJMeterUserDefinedVariables(environments[0]) : ''
  const samplers = requests
    .map(
      (r) => `
        <HTTPSamplerProxy guiclass="HttpTestSampleGui" testclass="HTTPSamplerProxy" testname="${escapeXml(r.name)}" enabled="true">
          <stringProp name="HTTPSampler.path">${escapeXml(r.url)}</stringProp>
          <stringProp name="HTTPSampler.method">${escapeXml(r.method)}</stringProp>
        </HTTPSamplerProxy>
        <hashTree/>`
    )
    .join('')
  return `<?xml version="1.0" encoding="UTF-8"?>
<jmeterTestPlan version="1.2">
  <hashTree>
    <TestPlan guiclass="TestPlanGui" testclass="TestPlan" testname="${escapeXml(projectName)}" enabled="true"/>
    <hashTree>${envBlock}
      <ThreadGroup guiclass="ThreadGroupGui" testclass="ThreadGroup" testname="Users" enabled="true">
        <stringProp name="ThreadGroup.num_threads">10</stringProp>
        <stringProp name="ThreadGroup.ramp_time">5</stringProp>
      </ThreadGroup>
      <hashTree>${samplers}
      </hashTree>
    </hashTree>
  </hashTree>
</jmeterTestPlan>`
}

export function serializeExport(
  format: string,
  project: ProjectFull,
  collections: ExportCollection[],
  environments?: ExportEnvironment[]
): { content: string; extension: string; mime: string } {
  switch (format) {
    case 'postman':
      return {
        content: JSON.stringify(buildPostmanCollection(project.name, collections, environments), null, 2),
        extension: 'postman_collection.json',
        mime: 'application/json',
      }
    case 'openapi':
      return {
        content: JSON.stringify(buildOpenApi(project, collections, environments), null, 2),
        extension: 'openapi.json',
        mime: 'application/json',
      }
    case 'k6':
      return {
        content: buildK6Script(project.name, collections, environments),
        extension: 'k6.js',
        mime: 'text/javascript',
      }
    case 'jmeter':
      return {
        content: buildJMeterPlan(project.name, collections, environments),
        extension: 'jmeter.jmx',
        mime: 'application/xml',
      }
    case 'json':
    default:
      return {
        content: JSON.stringify(buildHttpForgeJson(project, collections, environments), null, 2),
        extension: 'httpforge.json',
        mime: 'application/json',
      }
  }
}

export function defaultFilename(projectName: string, collectionName: string | null, extension: string): string {
  const base = collectionName ?? projectName.replace(/\s+/g, '-').toLowerCase()
  return `${base}.${extension.split('.').pop()}`
}
