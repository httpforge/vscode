/** Default env variable keys seeded for new projects — values are empty until configured */
export const DEV_ENVIRONMENT_ID = 'development'

export const DEFAULT_ENV_VARS = [
  { key: 'BASE_URL', value: '' },
  { key: 'ACCESS_TOKEN', value: '', secret: true },
  { key: 'API_KEY', value: '', secret: true },
]

/** Sample values for the Development environment on new projects */
export const SAMPLE_DEV_ENV_VARS = [
  { key: 'BASE_URL', value: 'https://jsonplaceholder.typicode.com' },
  { key: 'ACCESS_TOKEN', value: '', secret: true },
  { key: 'API_KEY', value: '', secret: true },
]

export function envVarsForEnvironment(environmentId: string): typeof DEFAULT_ENV_VARS {
  return environmentId === DEV_ENVIRONMENT_ID ? SAMPLE_DEV_ENV_VARS : DEFAULT_ENV_VARS
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

export function isLegacySampleProject(project: {
  id: string
  name?: string
  description?: string
}): boolean {
  return (
    (LEGACY_DUMMY_PROJECT_IDS as readonly string[]).includes(project.id) ||
    (project.name != null && (LEGACY_DUMMY_PROJECT_NAMES as readonly string[]).includes(project.name)) ||
    project.description === 'Sample API project'
  )
}

/** No demo projects — users create projects via the UI */
export const SEED_PROJECTS: SeedProject[] = []
