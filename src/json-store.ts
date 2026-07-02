import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import type { AppState } from './types';

export interface FallbackProjectData {
  id: string;
  name: string;
  description: string;
  folders: AppState['folders'];
  environments: AppState['environments'];
  activeEnvironmentId: string;
}

export interface FallbackProjectsStore {
  activeProjectId: string;
  projects: FallbackProjectData[];
  settings?: Record<string, string>;
}

const FILE_NAME = 'httpforge-store.json';
const LEGACY_FILE_NAMES = ['apiwatch-store.json', 'apiforge-store.json'];

export class JsonStore {
  constructor(private readonly storagePath: string) {}

  private filePath(): string {
    return join(this.storagePath, FILE_NAME);
  }

  load(): FallbackProjectsStore | null {
    const paths = [this.filePath(), ...LEGACY_FILE_NAMES.map((name) => join(this.storagePath, name))];
    for (const path of paths) {
      try {
        if (!existsSync(path)) continue;
        const raw = readFileSync(path, 'utf-8');
        const parsed = JSON.parse(raw) as FallbackProjectsStore;
        if (!parsed || !Array.isArray(parsed.projects)) continue;
        if (path !== this.filePath()) {
          this.save(parsed);
        }
        return parsed;
      } catch {
        continue;
      }
    }
    return null;
  }

  save(store: FallbackProjectsStore): void {
    mkdirSync(this.storagePath, { recursive: true });
    writeFileSync(this.filePath(), JSON.stringify(store, null, 2), 'utf-8');
  }
}
