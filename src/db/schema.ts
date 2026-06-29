export const SCHEMA_VERSION = 10

export const MIGRATIONS = [
  `CREATE TABLE IF NOT EXISTS schema_version (
    version INTEGER PRIMARY KEY
  )`,

  `CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`,

  `CREATE TABLE IF NOT EXISTS collections (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    name TEXT NOT NULL,
    protocol TEXT NOT NULL DEFAULT 'http',
    sort_order INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
  )`,

  `CREATE TABLE IF NOT EXISTS api_requests (
    id TEXT PRIMARY KEY,
    collection_id TEXT NOT NULL,
    name TEXT NOT NULL,
    method TEXT NOT NULL,
    url TEXT NOT NULL,
    protocol TEXT NOT NULL DEFAULT 'http',
    sort_order INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (collection_id) REFERENCES collections(id) ON DELETE CASCADE
  )`,

  `CREATE TABLE IF NOT EXISTS project_environments (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    name TEXT NOT NULL,
    color TEXT NOT NULL DEFAULT '#2563EB',
    sort_order INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
  )`,

  `CREATE TABLE IF NOT EXISTS env_variables (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    environment TEXT NOT NULL,
    key TEXT NOT NULL,
    value TEXT NOT NULL DEFAULT '',
    is_secret INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    UNIQUE(project_id, environment, key)
  )`,

  `CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  )`,

  `CREATE INDEX IF NOT EXISTS idx_collections_project ON collections(project_id)`,
  `CREATE INDEX IF NOT EXISTS idx_requests_collection ON api_requests(collection_id)`,
  `CREATE INDEX IF NOT EXISTS idx_env_project ON env_variables(project_id, environment)`,
  `CREATE INDEX IF NOT EXISTS idx_project_environments ON project_environments(project_id)`,

  `CREATE TABLE IF NOT EXISTS mock_endpoints (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    method TEXT NOT NULL,
    path TEXT NOT NULL,
    status_code INTEGER NOT NULL DEFAULT 200,
    delay_ms INTEGER NOT NULL DEFAULT 0,
    response_body TEXT NOT NULL DEFAULT '{}',
    request_body TEXT NOT NULL DEFAULT '',
    response_mode TEXT NOT NULL DEFAULT 'dynamic',
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
  )`,

  `CREATE INDEX IF NOT EXISTS idx_mock_endpoints_project ON mock_endpoints(project_id)`,

  `CREATE TABLE IF NOT EXISTS mock_data (
    project_id TEXT NOT NULL,
    resource_path TEXT NOT NULL,
    data_json TEXT NOT NULL DEFAULT '[]',
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (project_id, resource_path),
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
  )`,

  `CREATE INDEX IF NOT EXISTS idx_mock_data_project ON mock_data(project_id)`,
]

export const DEFAULT_ENVIRONMENTS = [
  { id: 'development', name: 'Development', color: '#10B981' },
  { id: 'staging', name: 'Staging', color: '#F59E0B' },
  { id: 'qa', name: 'QA', color: '#2563EB' },
  { id: 'production', name: 'Production', color: '#EF4444' },
]

export const ENV_COLOR_PALETTE = [
  '#2563EB', '#7C3AED', '#10B981', '#F59E0B', '#EF4444',
  '#06B6D4', '#EC4899', '#6366F1', '#14B8A6', '#F97316',
]
