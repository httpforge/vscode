import * as vscode from 'vscode';
import { AppState } from './types';
import { createDefaultState } from './defaults';

const STATE_KEY = 'httpforge.state';
const LEGACY_STATE_KEYS = ['apiwatch.state', 'apiforge.state'];

export class StateStore {
  constructor(private readonly context: vscode.ExtensionContext) {}

  async load(): Promise<AppState> {
    const saved = this.loadWithLegacyMigration<AppState>(STATE_KEY, LEGACY_STATE_KEYS);
    if (saved) {
      return saved;
    }
    return createDefaultState();
  }

  async save(state: AppState): Promise<void> {
    await this.context.globalState.update(STATE_KEY, state);
  }

  private loadWithLegacyMigration<T>(key: string, legacyKeys: string[]): T | undefined {
    const current = this.context.globalState.get<T>(key);
    if (current !== undefined) return current;
    for (const legacyKey of legacyKeys) {
      const legacy = this.context.globalState.get<T>(legacyKey);
      if (legacy !== undefined) {
        void this.context.globalState.update(key, legacy);
        return legacy;
      }
    }
    return undefined;
  }
}
