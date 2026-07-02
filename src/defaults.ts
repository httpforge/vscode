import { AppState } from './types';

export function createDefaultState(): AppState {
  return {
    projectId: '',
    projectName: '',
    projectDescription: '',
    projects: [],
    planLimits: {
      tierName: 'Free',
      maxProjects: Number.MAX_SAFE_INTEGER,
      projectCount: 0,
      canCreateProject: true,
    },
    activeEnvironmentId: '',
    environments: [],
    folders: [],
    openTabs: [],
    activeTabId: '',
    history: [],
    themeMode: 'system',
    language: 'en',
    activeProtocol: 'http',
    activeGraphqlTab: 'query',
    activeRequestTab: 'auth',
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
}
