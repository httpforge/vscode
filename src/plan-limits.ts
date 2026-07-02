import { listProjects, getSetting } from './db/project-repository';

export const DEFAULT_PLAN_TIER = 'free';

/** No cap on project count */
export const UNLIMITED_PROJECTS = Number.MAX_SAFE_INTEGER;

const PLAN_CONFIG: Record<string, { name: string; maxProjects: number }> = {
  free: { name: 'Free', maxProjects: UNLIMITED_PROJECTS },
};

export interface PlanLimits {
  tier: string;
  tierName: string;
  maxProjects: number;
  projectCount: number;
  canCreateProject: boolean;
}

export function getPlanTier(): string {
  return getSetting('planTier') ?? DEFAULT_PLAN_TIER;
}

export function getPlanLimits(): PlanLimits {
  const tier = getPlanTier();
  const config = PLAN_CONFIG[tier] ?? PLAN_CONFIG[DEFAULT_PLAN_TIER];
  const projectCount = listProjects().length;

  return {
    tier,
    tierName: config.name,
    maxProjects: config.maxProjects,
    projectCount,
    canCreateProject: true,
  };
}

export function assertCanCreateProject(): void {
  /* unlimited projects */
}
