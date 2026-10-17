import { ActionButtonRow } from '../ActionButtonRow'
import { Button } from '../ui'

export function WizardFooter({
  onBack,
  onContinue,
  onSaveDraft,
  onSaveAndContinueLater,
  onSubmit,
  continueLabel = 'Continue',
  submitLabel = 'Submit',
  saveDraftLabel = 'Save draft',
  saveAndContinueLaterLabel = 'Save & continue later',
  continueBusyLabel = 'Continuing…',
  submitBusyLabel = 'Saving…',
  saveDraftBusyLabel = 'Saving draft…',
  saveAndContinueLaterBusyLabel = 'Saving…',
  backDisabled,
  continueDisabled,
  submitDisabled,
  showBack = true,
  showContinue = true,
  showSaveDraft = false,
  showSaveAndContinueLater = false,
  showSubmit = false,
  busy = false,
}: {
  onBack?: () => void
  onContinue?: () => void
  onSaveDraft?: () => void
  onSaveAndContinueLater?: () => void
  onSubmit?: () => void
  continueLabel?: string
  submitLabel?: string
  saveDraftLabel?: string
  saveAndContinueLaterLabel?: string
  continueBusyLabel?: string
  submitBusyLabel?: string
  saveDraftBusyLabel?: string
  saveAndContinueLaterBusyLabel?: string
  backDisabled?: boolean
  continueDisabled?: boolean
  submitDisabled?: boolean
  showBack?: boolean
  showContinue?: boolean
  showSaveDraft?: boolean
  showSaveAndContinueLater?: boolean
  showSubmit?: boolean
  busy?: boolean
}) {
  return (
    <ActionButtonRow>
      {showContinue && onContinue ? (
        <Button
          type="button"
          className="min-h-11 cursor-pointer sm:min-w-36"
          onClick={onContinue}
          disabled={continueDisabled || busy}
        >
          {busy ? continueBusyLabel : continueLabel}
        </Button>
      ) : null}
      {showSubmit && onSubmit ? (
        <Button
          type="button"
          className="min-h-11 cursor-pointer sm:min-w-36"
          onClick={onSubmit}
          disabled={submitDisabled || busy}
        >
          {busy ? submitBusyLabel : submitLabel}
        </Button>
      ) : null}
      {showSaveAndContinueLater && onSaveAndContinueLater ? (
        <Button
          type="button"
          variant="secondary"
          className="min-h-11 cursor-pointer"
          onClick={onSaveAndContinueLater}
          disabled={busy}
        >
          {busy ? saveAndContinueLaterBusyLabel : saveAndContinueLaterLabel}
        </Button>
      ) : null}
      {showSaveDraft && onSaveDraft ? (
        <Button
          type="button"
          variant="secondary"
          className="min-h-11 cursor-pointer"
          onClick={onSaveDraft}
          disabled={busy}
        >
          {busy ? saveDraftBusyLabel : saveDraftLabel}
        </Button>
      ) : null}
      {showBack && onBack ? (
        <Button
          type="button"
          variant="secondary"
          className="min-h-11 cursor-pointer"
          onClick={onBack}
          disabled={backDisabled || busy}
        >
          Back
        </Button>
      ) : null}
    </ActionButtonRow>
  )
}
