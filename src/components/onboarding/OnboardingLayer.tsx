import { PageTipWalkthrough } from './PageTipWalkthrough'
import { PageTipsPreferenceDialog } from './PageTipsPreferenceDialog'

/** First-login tip preference + spotlight walkthroughs (when enabled). */
export function OnboardingLayer() {
  return (
    <>
      <PageTipsPreferenceDialog />
      <PageTipWalkthrough />
    </>
  )
}
