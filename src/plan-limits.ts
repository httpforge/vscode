import { listProjects, getSetting } from './db/project-repository';

export const DEFAULT_PLAN_TIER = 'free'

const PLAN_CONFIG: Record<string, { name: string; maxProjects: number }> = {
  free: { name: 'Free', maxProjects: 2 },
}

export interface PlanLimits {
  tier: string
  tierName: string
  maxProjects: number
  projectCount: number
  canCreateProject: boolean
}

export function getPlanTier(): string {
  return getSetting('planTier') ?? DEFAULT_PLAN_TIER
}

export function getPlanLimits(): PlanLimits {
  const tier = getPlanTier()
  const config = PLAN_CONFIG[tier] ?? PLAN_CONFIG[DEFAULT_PLAN_TIER]
  const projectCount = listProjects().length

  return {
    tier,
    tierName: config.name,
    maxProjects: config.maxProjects,
    projectCount,
    canCreateProject: projectCount < config.maxProjects,
  }
}

export function assertCanCreateProject(): void {
  const limits = getPlanLimits()
  if (!limits.canCreateProject) {
    throw new Error(
      `${limits.tierName} plan allows up to ${limits.maxProjects} projects. Delete a project or upgrade to create more.`
    )
  }
}
