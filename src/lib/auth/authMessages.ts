/** Map raw API / auth errors to friendly copy for SweetAlert. */
export function formatAuthError(message: string): { title: string; text?: string } {
    const lower = message.toLowerCase()
  
    if (lower.includes('request body too large') || lower.includes('1048576')) {
      return {
        title: 'Uploads too large',
        text: 'Registration documents are saved separately after sign-up. If you still see this, use smaller PDF or image files (under 800 KB each) and try again.',
      }
    }
  
    if (lower.includes('user already registered') || lower.includes('already been registered')) {
      return {
        title: 'Email already in use',
        text: 'An account with this email already exists. Sign in instead, or use a different email.',
      }
    }
  
    if (lower.includes('invalid login credentials') || lower.includes('invalid email or password')) {
      return {
        title: 'Sign-in failed',
        text: 'Check your email and password, then try again.',
      }
    }
  
    if (lower.includes('email not confirmed') || lower.includes('not confirmed')) {
      return {
        title: 'Confirm your email',
        text: 'Check your inbox for the confirmation link, then sign in.',
      }
    }
  
    if (lower.includes('password') && lower.includes('least')) {
      return { title: 'Weak password', text: message }
    }
  
    if (lower.includes('rate limit') || lower.includes('too many requests')) {
      return {
        title: 'Too many attempts',
        text: 'Please wait a moment and try again.',
      }
    }
  
    if (lower.includes('profile sync failed') || lower.includes('profile not found')) {
      return {
        title: 'Account created',
        text: 'Your account was created but setup is still finishing. Try signing in in a moment.',
      }
    }
  
    return { title: 'Something went wrong', text: message }
  }
  