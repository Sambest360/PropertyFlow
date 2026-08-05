import Swal, { type SweetAlertIcon, type SweetAlertOptions, type SweetAlertResult } from 'sweetalert2'
import { formatAuthError } from './auth/authMessages.js'

let stylesLoaded = false
function ensureSwalStyles() {
  if (stylesLoaded) return
  stylesLoaded = true
  void import('sweetalert2/dist/sweetalert2.min.css')
}

const baseOptions = {
  customClass: {
    popup: 'pf-swal-popup',
    title: 'pf-swal-title',
    htmlContainer: 'pf-swal-html',
    confirmButton: 'pf-swal-btn pf-swal-btn-primary',
    cancelButton: 'pf-swal-btn pf-swal-btn-secondary',
    denyButton: 'pf-swal-btn pf-swal-btn-secondary',
  },
  buttonsStyling: false,
  focusConfirm: true,
  heightAuto: false,
} satisfies SweetAlertOptions

function fire(options: SweetAlertOptions): Promise<SweetAlertResult> {
  ensureSwalStyles()
  return Swal.fire({
    ...baseOptions,
    ...options,
    customClass: {
      ...baseOptions.customClass,
      ...options.customClass,
    },
  })
}

export async function sweetSuccess(title: string, text?: string) {
  return fire({ icon: 'success', title, text, confirmButtonText: 'OK' })
}

export async function sweetError(title: string, text?: string) {
  return fire({ icon: 'error', title, text, confirmButtonText: 'OK' })
}

export async function sweetInfo(title: string, text?: string) {
  return fire({ icon: 'info', title, text, confirmButtonText: 'OK' })
}

export async function sweetWarning(title: string, text?: string) {
  return fire({ icon: 'warning', title, text, confirmButtonText: 'OK' })
}

export async function showAuthError(message: string) {
  if (!message.trim()) return
  const { title, text } = formatAuthError(message)
  await sweetError(title, text)
}

export async function showAuthWarning(message: string) {
  if (!message.trim()) return
  await sweetWarning('Check your details', message)
}

export async function sweetConfirm(
  title: string,
  text: string,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
) {
  const result = await fire({
    icon: 'question',
    title,
    text,
    showCancelButton: true,
    confirmButtonText: confirmText,
    cancelButtonText: cancelText,
    reverseButtons: true,
  })
  return result.isConfirmed
}

export async function sweetToast(title: string, icon: SweetAlertIcon = 'success') {
  return Swal.mixin({
    toast: true,
    position: 'top-end',
    showConfirmButton: false,
    timer: 4200,
    timerProgressBar: true,
    customClass: {
      popup: 'pf-swal-toast',
      title: 'pf-swal-toast-title',
    },
  }).fire({ icon, title })
}

export async function showRegistrationCompleteAlert(input: {
  email: string
  kind: 'email_confirmation' | 'sign_in_required'
}) {
  const emailConfirmation = input.kind === 'email_confirmation'
  await fire({
    icon: 'success',
    title: emailConfirmation ? 'Account created!' : 'Almost there!',
    html: emailConfirmation
      ? `<p class="pf-swal-lead">We sent a confirmation link to <strong>${escapeHtml(input.email)}</strong>.</p><p>Open your inbox, confirm your email, then sign in to start using PropertyFlow.</p>`
      : `<p class="pf-swal-lead">Your account for <strong>${escapeHtml(input.email)}</strong> is ready.</p><p>Sign in with the email and password you just created.</p>`,
    confirmButtonText: 'Go to sign in',
    allowOutsideClick: false,
    allowEscapeKey: false,
  })
}

/** Full page navigation so auth state is cleared before login. */
export function redirectToLogin(next?: string | null, registered?: 'confirm-email' | 'ready') {
  const qs = new URLSearchParams()
  if (next) qs.set('next', next)
  if (registered) qs.set('registered', registered)
  const suffix = qs.toString()
  window.location.assign(suffix ? `/login?${suffix}` : '/login')
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
