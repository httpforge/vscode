import * as vscode from 'vscode';
import type { AppState, HistoryEntry, ThemeMode, AppLanguage } from './types';

const UI_STATE_KEY = 'httpforge.ui';
const HISTORY_KEY = 'httpforge.history';
const LEGACY_UI_KEYS = ['apiwatch.ui', 'apiforge.ui'];
const LEGACY_HISTORY_KEYS = ['apiwatch.history', 'apiforge.history'];

export interface UiPreferences {
  openTabs: string[];
  activeTabId: string;
  themeMode: ThemeMode;
  language: AppLanguage;
  activeProtocol: string;
  activeGraphqlTab: 'query' | 'variables' | 'headers';
  /** @deprecated migrated to themeMode */
  darkMode?: boolean;
  activeRequestTab: AppState['activeRequestTab'];
  activeResponseTab: AppState['activeResponseTab'];
  sidebarNav: string;
  expandedFolders: string[];
  searchQuery: string;
  performance: AppState['performance'];
}

const defaultUi: UiPreferences = {
  openTabs: [],
  activeTabId: '',
  themeMode: 'system',
  language: 'en',
  activeProtocol: 'http',
  activeGraphqlTab: 'query',
  activeRequestTab: 'params',
  activeResponseTab: 'json',
  sidebarNav: 'workspace',
  expandedFolders: [],
  searchQuery: '',
  performance: {
    avgResponseMs: 0,
    requestsPerSec: 0,
    successRate: 100,
    chart: [],
  },
};

function resolveThemeMode(ui: UiPreferences): ThemeMode {
  if (ui.themeMode) return ui.themeMode;
  if (ui.darkMode === true) return 'dark';
  if (ui.darkMode === false) return 'system';
  return 'system';
}

export class UiStore {
  constructor(private readonly context: vscode.ExtensionContext) {}

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

  async loadUi(): Promise<UiPreferences> {
    const saved = this.loadWithLegacyMigration<UiPreferences & { lastResponse?: unknown }>(
      UI_STATE_KEY,
      LEGACY_UI_KEYS
    );
    if (!saved) return { ...defaultUi };
    const { lastResponse: _removed, ...rest } = saved;
    return { ...defaultUi, ...rest, themeMode: resolveThemeMode(saved) };
  }

  async saveUi(ui: UiPreferences): Promise<void> {
    await this.context.globalState.update(UI_STATE_KEY, ui);
  }

  async loadHistory(): Promise<HistoryEntry[]> {
    await this.clearHistory();
    return [];
  }

  async saveHistory(_history: HistoryEntry[]): Promise<void> {
    await this.clearHistory();
  }

  private async clearHistory(): Promise<void> {
    await this.context.globalState.update(HISTORY_KEY, []);
    for (const legacyKey of LEGACY_HISTORY_KEYS) {
      await this.context.globalState.update(legacyKey, undefined);
    }
  }

  extractUiFromState(state: AppState): UiPreferences {
    return {
      openTabs: state.openTabs,
      activeTabId: state.activeTabId,
      themeMode: state.themeMode,
      language: state.language,
      activeProtocol: state.activeProtocol,
      activeGraphqlTab: state.activeGraphqlTab,
      activeRequestTab: state.activeRequestTab,
      activeResponseTab: state.activeResponseTab,
      sidebarNav: state.sidebarNav,
      expandedFolders: state.expandedFolders,
      searchQuery: state.searchQuery,
      performance: state.performance,
    };
  }
}
