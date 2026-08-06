export type ApplicantDetailTab =
  | 'overview'
  | 'details'
  | 'documents'
  | 'residences'
  | 'blocks'
  | 'application'
  | 'history'

export const APPLICANT_DETAIL_TABS: ApplicantDetailTab[] = [
  'overview',
  'details',
  'documents',
  'residences',
  'blocks',
  'application',
  'history',
]

export const DEFAULT_APPLICANT_DETAIL_TAB: ApplicantDetailTab = 'application'

export function isApplicantDetailTab(v: string | null): v is ApplicantDetailTab {
  return Boolean(v && (APPLICANT_DETAIL_TABS as string[]).includes(v))
}

export const ICON_STROKE = 1.6
