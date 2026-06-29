import { AppState } from './types';

export function createDefaultState(): AppState {
  return {
    projectId: '',
    projectName: '',
    projectDescription: '',
    projects: [],
    planLimits: {
      tierName: 'Free',
      maxProjects: 2,
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
    sidebarNav: 'projects',
    expandedFolders: [],
    searchQuery: '',
    performance: {
      avgResponseMs: 0,
      requestsPerSec: 0,
      successRate: 100,
      chart: [40, 55, 45, 70, 60, 85, 75, 50, 65, 80, 90, 55],
    },
  };
}
