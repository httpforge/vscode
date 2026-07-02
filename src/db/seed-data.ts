/** Suggested env variable keys when users add variables manually */
export const DEFAULT_ENV_VAR_KEYS = ['BASE_URL', 'ACCESS_TOKEN', 'API_KEY'] as const

export const DEFAULT_ENV_VARS = [
  { key: 'BASE_URL', value: '' },
  { key: 'ACCESS_TOKEN', value: '', secret: true },
  { key: 'API_KEY', value: '', secret: true },
]

/** Fixed IDs from older auto-seeded environments — removed on migration */
export const LEGACY_DEFAULT_ENVIRONMENT_IDS = ['development', 'staging', 'qa', 'production'] as const

export const LEGACY_DEFAULT_ENVIRONMENT_NAMES = [
  'Development',
  'Staging',
  'QA',
  'Production',
] as const

/** Common placeholder environment names with no real configuration */
export const LEGACY_MOCK_ENVIRONMENT_NAMES = [
  'dev',
  'prod',
  'test',
  ...LEGACY_DEFAULT_ENVIRONMENT_NAMES,
] as const

export function envVarsForEnvironment(_environmentId: string): typeof DEFAULT_ENV_VARS {
  return DEFAULT_ENV_VARS
}

/** Default variable keys/values when a user creates a new environment */
export function variablesForNewEnvironment(): Record<string, string> {
  return Object.fromEntries(
    DEFAULT_ENV_VARS.map((v) => [v.key, v.key === 'BASE_URL' ? 'http://localhost' : v.value])
  )
}

export function isLegacyMockEnvironment(environment: {
  id?: string
  name?: string
  variables?: Record<string, string>
}): boolean {
  const id = environment.id ?? ''
  return (LEGACY_DEFAULT_ENVIRONMENT_IDS as readonly string[]).includes(id)
}

export interface SeedProject {
  id: string
  name: string
  description: string
  collections: {
    id: string
    name: string
    protocol?: string
    requests: { id: string; name: string; method: string; url: string; protocol?: string }[]
  }[]
  envDefaults: Record<string, { key: string; value: string; secret?: boolean }[]>
}

/** Legacy demo project IDs/names from initial seed — removed on migration */
export const LEGACY_DUMMY_PROJECT_IDS = ['ecommerce', 'banking', 'hospital', 'crm', 'sample'] as const

export const LEGACY_DUMMY_PROJECT_NAMES = [
  'E-Commerce API',
  'Banking API',
  'Hospital API',
  'CRM API',
] as const

/** Auto-created starter project from older versions */
export const LEGACY_AUTO_PROJECT_NAME = 'My API Project'
export const LEGACY_AUTO_PROJECT_DESCRIPTION = 'Default workspace'

export const LEGACY_SAMPLE_ENV_URLS = [
  'https://jsonplaceholder.typicode.com',
  'https://api.example.com',
] as const

export function isLegacySampleProject(project: {
  id: string
  name?: string
  description?: string
}): boolean {
  return (
    (LEGACY_DUMMY_PROJECT_IDS as readonly string[]).includes(project.id) ||
    (project.name != null && (LEGACY_DUMMY_PROJECT_NAMES as readonly string[]).includes(project.name)) ||
    project.description === 'Sample API project' ||
    (project.name === LEGACY_AUTO_PROJECT_NAME && project.description === LEGACY_AUTO_PROJECT_DESCRIPTION)
  )
}

export function isLegacyMockProject(project: {
  id: string
  name?: string
  description?: string
  collectionCount?: number
  requestCount?: number
}): boolean {
  return isLegacySampleProject(project)
}

export function isLegacySampleEnvValue(key: string, value: string): boolean {
  return key === 'BASE_URL' && (LEGACY_SAMPLE_ENV_URLS as readonly string[]).includes(value)
}

/** No demo projects — users create projects via the UI */
export const SEED_PROJECTS: SeedProject[] = []
