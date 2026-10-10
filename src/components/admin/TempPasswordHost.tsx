import { useEffect, useState } from 'react'
import { onTempPasswordShown } from '../../lib/auth/tempPasswordBus'
import { TempPasswordModal } from './ResetPasswordButton'

/** App-level one-time temp password modal (e.g. a landlord created in the property wizard). */
export function TempPasswordHost() {
  const [shown, setShown] = useState<{ tempPassword: string; title: string } | null>(null)
  useEffect(() => onTempPasswordShown(setShown), [])
  return (
    <TempPasswordModal
      title={shown?.title}
      tempPassword={shown?.tempPassword ?? null}
      onClose={() => setShown(null)}
    />
  )
}
