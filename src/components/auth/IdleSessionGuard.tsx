/**
 * Signs the user out after a period without activity, with a one-minute
 * warning they can dismiss. Mounted in the workspace shell.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Clock } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { IDLE_STORAGE_KEY, idlePhase, idleTimeoutMs, readLastActivity, writeLastActivity } from '../../lib/idleSession'
import { Button, Modal } from '../ui'

const EVENTS = ['mousedown', 'keydown', 'scroll', 'touchstart', 'pointermove'] as const

export function IdleSessionGuard() {
  const { isAuthenticated, logout } = useAuth()
  const navigate = useNavigate()
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null)
  const lastWrite = useRef(0)
  const signingOut = useRef(false)
  // Keep the interval stable when these functions change identity.
  const logoutRef = useRef(logout)
  logoutRef.current = logout
  const navigateRef = useRef(navigate)
  navigateRef.current = navigate

  const touch = useCallback(() => {
    const now = Date.now()
    // Write at most every 5 s; pointer moves fire constantly.
    if (now - lastWrite.current < 5_000) return
    lastWrite.current = now
    writeLastActivity(now)
  }, [])

  useEffect(() => {
    if (!isAuthenticated) return
    signingOut.current = false
    writeLastActivity()
    for (const e of EVENTS) window.addEventListener(e, touch, { passive: true })
    const tick = window.setInterval(() => {
      const { phase, msLeft } = idlePhase(readLastActivity(), Date.now())
      if (phase === 'expired') {
        if (signingOut.current) return
        signingOut.current = true
        setSecondsLeft(null)
        void logoutRef.current().finally(() => navigateRef.current('/login?reason=idle', { replace: true }))
      } else if (phase === 'warning') {
        setSecondsLeft(Math.ceil(msLeft / 1000))
      } else {
        setSecondsLeft(null)
      }
    }, 1_000)
    // Another tab's activity resets the warning here too.
    const onStorage = (e: StorageEvent) => {
      if (e.key === IDLE_STORAGE_KEY) setSecondsLeft(null)
    }
    window.addEventListener('storage', onStorage)
    return () => {
      for (const e of EVENTS) window.removeEventListener(e, touch)
      window.clearInterval(tick)
      window.removeEventListener('storage', onStorage)
    }
  }, [isAuthenticated, touch])

  if (secondsLeft == null) return null
  const stay = () => {
    lastWrite.current = Date.now()
    writeLastActivity()
    setSecondsLeft(null)
  }
  return (
    <Modal
      open
      onClose={stay}
      title="Still there?"
      description={`For your security you will be signed out in ${secondsLeft} second${secondsLeft === 1 ? '' : 's'}.`}
      footer={
        <>
          <Button
            variant="secondary"
            onClick={() => {
              signingOut.current = true
              void logout().finally(() => navigate('/login', { replace: true }))
            }}
          >
            Sign out now
          </Button>
          <Button onClick={stay}>Stay signed in</Button>
        </>
      }
    >
      <p className="inline-flex items-center gap-2 text-sm text-ink-600">
        <Clock className="h-4 w-4 text-primary" aria-hidden /> You have been inactive for {Math.round(idleTimeoutMs() / 60_000) - 1} minutes.
      </p>
    </Modal>
  )
}
