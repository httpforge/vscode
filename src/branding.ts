export const APP_NAME = 'HttpForge'
export const APP_DOMAIN = 'httpforge.com'
export const APP_DOCS_DOMAIN = 'httpforge.org'
export const APP_WEBSITE = `https://${APP_DOMAIN}`
export const COLLECTIONS_FILENAME = 'httpforge-collections.json'
export const LEGACY_COLLECTIONS_FILENAMES = [
  'apiwatch-collections.json',
  'apiforge-collections.json',
] as const
/** @deprecated Use LEGACY_COLLECTIONS_FILENAMES */
export const LEGACY_COLLECTIONS_FILENAME = LEGACY_COLLECTIONS_FILENAMES[0]
export const EXPORT_FORMAT_KEY = 'httpforge'
export const LEGACY_EXPORT_FORMAT_KEYS = ['apiwatch', 'apiforge'] as const
/** @deprecated Use LEGACY_EXPORT_FORMAT_KEYS */
export const LEGACY_EXPORT_FORMAT_KEY = LEGACY_EXPORT_FORMAT_KEYS[1]

export function isHttpForgeExport(doc: Record<string, unknown>): boolean {
  if (doc[EXPORT_FORMAT_KEY]) return true
  return LEGACY_EXPORT_FORMAT_KEYS.some((key) => key in doc)
}

export interface AppDocLinks {
  releaseNotes: string
  learningCenter: string
  support: string
  security: string
  privacy: string
  terms: string
}

export const GITHUB_DEFAULT_BRANCH = 'main'

export function githubBlobUrl(
  github: string,
  filePath: string,
  branch: string = GITHUB_DEFAULT_BRANCH
): string {
  return `${github.replace(/\/$/, '')}/blob/${branch}/${filePath}`
}

export function buildDocLinks(github: string): AppDocLinks {
  const base = github.replace(/\/$/, '')
  return {
    releaseNotes: githubBlobUrl(base, 'CHANGELOG.md'),
    learningCenter: githubBlobUrl(base, 'README.md'),
    support: `${base}/issues`,
    security: githubBlobUrl(base, 'SECURITY.md'),
    privacy: githubBlobUrl(base, 'PRIVACY.md'),
    terms: githubBlobUrl(base, 'TERMS.md'),
  }
}

export interface AppInfo {
  name: string
  version: string
  tagline: string
  openSourceTagline: string
  description: string
  platform: string
  publisher: string
  author: string
  license: string
  copyright: string
  website: string
  email: string
  docs: string
  github: string
  docLinks: AppDocLinks
  features: string[]
}

const GITHUB_REPO = 'https://github.com/httpforge/httpforge'

export const APP_INFO: AppInfo = {
  name: APP_NAME,
  version: '0.1.17',
  tagline: 'Forge Your API Requests',
  openSourceTagline: 'Privacy First · Lightweight alternative to Postman, Insomnia & Bruno',
  description:
    'HttpForge is an open-source VS Code extension for API development and testing. Explore and send HTTP, GraphQL, and WebSocket requests, manage collections and environments, sync with Git, publish API documentation, and import or export Postman and OpenAPI formats — without leaving your editor.',
  platform: 'VS Code Extension · Open Source',
  publisher: 'httpforge',
  author: 'HttpForge',
  license: 'MIT License',
  copyright: 'Copyright (c) 2026 HttpForge',
  website: APP_WEBSITE,
  email: 'httpforge@outlook.com',
  docs: githubBlobUrl(GITHUB_REPO, 'README.md'),
  github: GITHUB_REPO,
  docLinks: buildDocLinks(GITHUB_REPO),
  features: [
    'Privacy First — local storage, no telemetry, no mandatory cloud account',
    'Lightweight Postman / Insomnia / Bruno alternative inside VS Code',
    'HTTP, GraphQL & WebSocket request builder',
    'Collections, folders & multi-project workspace',
    'Environment variables with {{VAR}} autocomplete',
    'Params, headers, auth (Bearer / Basic / API Key) & body editor',
    'Response viewer — JSON, raw, headers & timeline',
    'Import / export — Postman, OpenAPI, JMeter, k6 & more',
    'Git sync & API documentation publishing',
    'Request history & multilingual UI (20 languages)',
  ],
}
