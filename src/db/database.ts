import { existsSync, copyFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';
import type Database from 'better-sqlite3';
import { MIGRATIONS, SCHEMA_VERSION, DEFAULT_ENVIRONMENTS } from './schema';
import {
  SEED_PROJECTS,
  LEGACY_DUMMY_PROJECT_IDS,
  LEGACY_DUMMY_PROJECT_NAMES,
  LEGACY_AUTO_PROJECT_NAME,
  LEGACY_AUTO_PROJECT_DESCRIPTION,
  LEGACY_SAMPLE_ENV_URLS,
  LEGACY_DEFAULT_ENVIRONMENT_IDS,
  isLegacyMockEnvironment,
  isLegacyMockProject,
} from './seed-data';
import { ensureDefaultEnvironments } from './environment-repository';

let db: Database.Database | null = null;
let dbPath = '';
let initError: string | null = null;

function loadSqlite(): typeof import('better-sqlite3') {
  try {
    // Lazy require — native module must not load at extension startup
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('better-sqlite3');
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`SQLite module not available: ${message}`);
  }
}

export function isDatabaseReady(): boolean {
  return db !== null;
}

export function getDatabaseError(): string | null {
  return initError;
}

export function getDbPath(): string {
  return dbPath;
}

export function getDatabase(): Database.Database {
  if (!db) throw new Error('Database not initialized');
  return db;
}

export function initDatabase(storagePath: string): void {
  initError = null;
  try {
    const SqliteDatabase = loadSqlite();
    mkdirSync(storagePath, { recursive: true });
    const targetPath = join(storagePath, 'httpforge.db');
    const legacyPaths = ['apiwatch.db', 'apiforge.db'];

    for (const legacyName of legacyPaths) {
      const legacyPath = join(storagePath, legacyName);
      if (!existsSync(targetPath) && existsSync(legacyPath)) {
        copyFileSync(legacyPath, targetPath);
        break;
      }
    }

    dbPath = targetPath;
    db = new SqliteDatabase(dbPath);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');

    for (const sql of MIGRATIONS) {
      db.exec(sql);
    }

    const row = db.prepare('SELECT version FROM schema_version LIMIT 1').get() as { version: number } | undefined;
    const currentVersion = row?.version ?? 0;

    if (currentVersion === 0) {
      db.prepare('INSERT INTO schema_version (version) VALUES (?)').run(SCHEMA_VERSION);
      seedDatabase();
    } else if (currentVersion < SCHEMA_VERSION) {
      runMigrations(currentVersion);
      db.prepare('UPDATE schema_version SET version = ?').run(SCHEMA_VERSION);
    }

    purgeLegacySampleProjects();
    purgeLegacyMockEnvironments();
  } catch (err) {
    db?.close();
    db = null;
    dbPath = '';
    initError = err instanceof Error ? err.message : String(err);
    throw new Error(`Database initialization failed: ${initError}`);
  }
}

function runMigrations(fromVersion: number): void {
  if (fromVersion < 2) migrateV1ToV2();
  if (fromVersion < 3) migrateV2ToV3();
  if (fromVersion < 4) migrateV3ToV4();
  if (fromVersion < 5) migrateV4ToV5();
  if (fromVersion < 6) migrateV5ToV6();
  if (fromVersion < 7) migrateV6ToV7();
  if (fromVersion < 8) migrateV7ToV8();
  if (fromVersion < 9) migrateV8ToV9();
  if (fromVersion < 10) migrateV9ToV10();
}

function migrateV9ToV10(): void {
  const database = getDatabase();
  const columns = database.prepare('PRAGMA table_info(api_requests)').all() as { name: string }[];
  if (!columns.some((c) => c.name === 'request_config')) {
    database.exec(`ALTER TABLE api_requests ADD COLUMN request_config TEXT NOT NULL DEFAULT '{}'`);
  }
}

function migrateV8ToV9(): void {
  const database = getDatabase();
  const columns = database.prepare('PRAGMA table_info(mock_endpoints)').all() as { name: string }[];
  if (!columns.some((c) => c.name === 'request_body')) {
    database.exec(`ALTER TABLE mock_endpoints ADD COLUMN request_body TEXT NOT NULL DEFAULT ''`);
  }
}

function migrateV7ToV8(): void {
  const database = getDatabase();
  const columns = database.prepare('PRAGMA table_info(mock_endpoints)').all() as { name: string }[];
  if (!columns.some((c) => c.name === 'response_mode')) {
    database.exec(`ALTER TABLE mock_endpoints ADD COLUMN response_mode TEXT NOT NULL DEFAULT 'dynamic'`);
  }
}

function migrateV6ToV7(): void {
  getDatabase().exec(`
    CREATE TABLE IF NOT EXISTS mock_data (
      project_id TEXT NOT NULL,
      resource_path TEXT NOT NULL,
      data_json TEXT NOT NULL DEFAULT '[]',
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (project_id, resource_path),
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_mock_data_project ON mock_data(project_id);
  `);
}

function migrateV5ToV6(): void {
  getDatabase().exec(`
    CREATE TABLE IF NOT EXISTS mock_endpoints (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      method TEXT NOT NULL,
      path TEXT NOT NULL,
      status_code INTEGER NOT NULL DEFAULT 200,
      delay_ms INTEGER NOT NULL DEFAULT 0,
      response_body TEXT NOT NULL DEFAULT '{}',
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_mock_endpoints_project ON mock_endpoints(project_id);
  `);
}

function purgeLegacyMockEnvironments(): void {
  const database = getDatabase();
  const deleteVarsByEnv = database.prepare('DELETE FROM env_variables WHERE project_id = ? AND environment = ?');
  const deleteEnv = database.prepare('DELETE FROM project_environments WHERE id = ? AND project_id = ?');
  const listEnvs = database.prepare(
    'SELECT id, name FROM project_environments WHERE project_id = ? ORDER BY sort_order, name'
  );
  const listVars = database.prepare(
    'SELECT key, value FROM env_variables WHERE project_id = ? AND environment = ? ORDER BY key'
  );
  const projects = database.prepare('SELECT id FROM projects').all() as { id: string }[];

  database.transaction(() => {
    for (const project of projects) {
      const envs = listEnvs.all(project.id) as { id: string; name: string }[];
      const removeIds = new Set<string>();

      for (const env of envs) {
        if ((LEGACY_DEFAULT_ENVIRONMENT_IDS as readonly string[]).includes(env.id)) {
          removeIds.add(env.id);
          continue;
        }

        const vars = listVars.all(project.id, env.id) as { key: string; value: string }[];
        const variables = Object.fromEntries(vars.map((v) => [v.key, v.value]));
        if (isLegacyMockEnvironment({ id: env.id, name: env.name, variables })) {
          removeIds.add(env.id);
        }
      }

      for (const envId of removeIds) {
        deleteVarsByEnv.run(project.id, envId);
        deleteEnv.run(envId, project.id);
      }
    }

    const active = database.prepare("SELECT value FROM app_settings WHERE key = 'activeEnvironment'").get() as
      | { value: string }
      | undefined;
    if (active?.value) {
      const stillExists = database.prepare('SELECT id FROM project_environments WHERE id = ?').get(active.value);
      if (!stillExists) {
        database.prepare("DELETE FROM app_settings WHERE key = 'activeEnvironment'").run();
      }
    }
  })();
}

function purgeLegacySampleProjects(): void {
  const database = getDatabase();
  const deleteById = database.prepare('DELETE FROM projects WHERE id = ?');
  const deleteByName = database.prepare('DELETE FROM projects WHERE name = ?');
  const deleteByDescription = database.prepare("DELETE FROM projects WHERE description = 'Sample API project'");
  const deleteAutoProject = database.prepare('DELETE FROM projects WHERE name = ?');
  const clearSampleEnvUrl = database.prepare(
    "UPDATE env_variables SET value = '' WHERE key = 'BASE_URL' AND value = ?"
  );
  const emptyMockProjects = database.prepare(`
    SELECT p.id FROM projects p
    WHERE trim(p.description) = ''
      AND NOT EXISTS (SELECT 1 FROM collections c WHERE c.project_id = p.id)
      AND NOT EXISTS (
        SELECT 1 FROM api_requests r
        JOIN collections c ON r.collection_id = c.id
        WHERE c.project_id = p.id
      )
  `);

  database.transaction(() => {
    for (const id of LEGACY_DUMMY_PROJECT_IDS) deleteById.run(id);
    for (const name of LEGACY_DUMMY_PROJECT_NAMES) deleteByName.run(name);
    deleteByDescription.run();
    deleteAutoProject.run(LEGACY_AUTO_PROJECT_NAME);
    for (const row of emptyMockProjects.all() as { id: string }[]) {
      deleteById.run(row.id);
    }
    for (const url of LEGACY_SAMPLE_ENV_URLS) clearSampleEnvUrl.run(url);

    const active = database.prepare("SELECT value FROM app_settings WHERE key = 'activeProjectId'").get() as
      | { value: string }
      | undefined;

    if (active?.value) {
      const stillExists = database.prepare('SELECT id FROM projects WHERE id = ?').get(active.value);
      if (!stillExists) {
        const next = database.prepare('SELECT id FROM projects ORDER BY updated_at DESC LIMIT 1').get() as
          | { id: string }
          | undefined;
        if (next?.id) {
          database
            .prepare(
              "INSERT INTO app_settings (key, value) VALUES ('activeProjectId', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
            )
            .run(next.id);
        } else {
          database.prepare("DELETE FROM app_settings WHERE key = 'activeProjectId'").run();
        }
      }
    }
  })();
}

function migrateV4ToV5(): void {
  const database = getDatabase();
  const deleteById = database.prepare('DELETE FROM projects WHERE id = ?');
  const deleteByName = database.prepare('DELETE FROM projects WHERE name = ?');

  database.transaction(() => {
    for (const id of LEGACY_DUMMY_PROJECT_IDS) deleteById.run(id);
    for (const name of LEGACY_DUMMY_PROJECT_NAMES) deleteByName.run(name);

    const active = database.prepare("SELECT value FROM app_settings WHERE key = 'activeProjectId'").get() as
      | { value: string }
      | undefined;

    if (active?.value) {
      const stillExists = database.prepare('SELECT id FROM projects WHERE id = ?').get(active.value);
      if (!stillExists) {
        const next = database.prepare('SELECT id FROM projects ORDER BY updated_at DESC LIMIT 1').get() as
          | { id: string }
          | undefined;
        if (next?.id) {
          database
            .prepare(
              "INSERT INTO app_settings (key, value) VALUES ('activeProjectId', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
            )
            .run(next.id);
        } else {
          database.prepare("DELETE FROM app_settings WHERE key = 'activeProjectId'").run();
        }
      }
    }
  })();
}

function migrateV3ToV4(): void {
  const database = getDatabase();
  const columns = database.prepare('PRAGMA table_info(collections)').all() as { name: string }[];
  if (!columns.some((c) => c.name === 'protocol')) {
    database.exec(`ALTER TABLE collections ADD COLUMN protocol TEXT NOT NULL DEFAULT 'http'`);
  }
}

function migrateV2ToV3(): void {
  const database = getDatabase();
  const columns = database.prepare('PRAGMA table_info(api_requests)').all() as { name: string }[];
  if (!columns.some((c) => c.name === 'protocol')) {
    database.exec(`ALTER TABLE api_requests ADD COLUMN protocol TEXT NOT NULL DEFAULT 'http'`);
  }
}

function migrateV1ToV2(): void {
  const database = getDatabase();
  const projects = database.prepare('SELECT id FROM projects').all() as { id: string }[];
  for (const p of projects) {
    ensureDefaultEnvironments(p.id, DEFAULT_ENVIRONMENTS);
  }
}

function seedDatabase(): void {
  const database = getDatabase();
  const now = Date.now();

  const insertProject = database.prepare(
    `INSERT INTO projects (id, name, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`
  );
  const insertCollection = database.prepare(
    `INSERT INTO collections (id, project_id, name, protocol, sort_order) VALUES (?, ?, ?, ?, ?)`
  );
  const insertRequest = database.prepare(
    `INSERT INTO api_requests (id, collection_id, name, method, url, protocol, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)`
  );
  const insertEnvVar = database.prepare(
    `INSERT INTO env_variables (id, project_id, environment, key, value, is_secret) VALUES (?, ?, ?, ?, ?, ?)`
  );

  const seed = database.transaction(() => {
    for (const project of SEED_PROJECTS) {
      insertProject.run(project.id, project.name, project.description, now, now);

      project.collections.forEach((col, colIdx) => {
        insertCollection.run(col.id, project.id, col.name, col.protocol ?? 'http', colIdx);
        col.requests.forEach((req, reqIdx) => {
          insertRequest.run(req.id, col.id, req.name, req.method, req.url, req.protocol ?? 'http', reqIdx);
        });
      });

      for (const [environment, vars] of Object.entries(project.envDefaults)) {
        for (const v of vars) {
          insertEnvVar.run(randomUUID(), project.id, environment, v.key, v.value, v.secret ? 1 : 0);
        }
      }

      ensureDefaultEnvironments(project.id, DEFAULT_ENVIRONMENTS);
    }

    if (SEED_PROJECTS.length > 0) {
      database.prepare(`INSERT INTO app_settings (key, value) VALUES (?, ?)`).run('activeProjectId', SEED_PROJECTS[0].id);
    }
    database.prepare(`INSERT INTO app_settings (key, value) VALUES (?, ?)`).run('activeEnvironment', 'development');
  });

  seed();
}

export function seedDefaultEnvVars(_projectId: string): void {
  /* no-op — environments are created by the user */
}

export function closeDatabase(): void {
  db?.close();
  db = null;
}
