export type ApplicantDetailTab =
  | 'overview'
  | 'documents'
  | 'residences'
  | 'blocks'
  | 'application'

export const APPLICANT_DETAIL_TABS: ApplicantDetailTab[] = [
  'overview',
  'documents',
  'residences',
  'blocks',
  'application',
]

export function isApplicantDetailTab(v: string | null): v is ApplicantDetailTab {
  return Boolean(v && (APPLICANT_DETAIL_TABS as string[]).includes(v))
}

export const ICON_STROKE = 1.6
