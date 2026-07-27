export type TeamDetailTab = 'overview' | 'details' | 'workload' | 'history'

export const TEAM_DETAIL_TABS: TeamDetailTab[] = ['overview', 'details', 'workload', 'history']

export function isTeamDetailTab(v: string | null): v is TeamDetailTab {
  return Boolean(v && (TEAM_DETAIL_TABS as string[]).includes(v))
}

export const ICON_STROKE = 1.6
