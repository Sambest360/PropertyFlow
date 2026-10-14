/**
 * Firebase web client for Letkaya.
 *
 * Primary product data remains in PostgreSQL via the Hono API.
 * This module connects the Vite app to the Firebase project (Firestore)
 * for health checks, Auth, or Storage — not as a full PMS database replacement.
 */

import { initializeApp, type FirebaseApp } from 'firebase/app'
import { getFirestore, doc, getDoc, type Firestore } from 'firebase/firestore'

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY as string | undefined,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID as string | undefined,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET as string | undefined,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID as string | undefined,
  appId: import.meta.env.VITE_FIREBASE_APP_ID as string | undefined,
}

export function isFirebaseConfigured(): boolean {
  return Boolean(
    firebaseConfig.apiKey &&
      firebaseConfig.projectId &&
      firebaseConfig.appId &&
      firebaseConfig.authDomain,
  )
}

let app: FirebaseApp | null = null
let db: Firestore | null = null

export function getFirebaseApp(): FirebaseApp | null {
  if (!isFirebaseConfigured()) return null
  if (!app) {
    app = initializeApp({
      apiKey: firebaseConfig.apiKey!,
      authDomain: firebaseConfig.authDomain!,
      projectId: firebaseConfig.projectId!,
      storageBucket: firebaseConfig.storageBucket,
      messagingSenderId: firebaseConfig.messagingSenderId,
      appId: firebaseConfig.appId!,
    })
  }
  return app
}

export function getFirestoreDb(): Firestore | null {
  const firebaseApp = getFirebaseApp()
  if (!firebaseApp) return null
  if (!db) db = getFirestore(firebaseApp)
  return db
}

/** Lightweight connectivity check against the public `_meta/health` doc (if present). */
export async function pingFirestore(timeoutMs = 4000): Promise<{
  ok: boolean
  configured: boolean
  projectId?: string
  error?: string
}> {
  if (!isFirebaseConfigured()) {
    return { ok: false, configured: false, error: 'Firebase env vars missing' }
  }
  const firestore = getFirestoreDb()
  if (!firestore) {
    return { ok: false, configured: true, error: 'Firestore not initialized' }
  }

  try {
    const result = await Promise.race([
      getDoc(doc(firestore, '_meta', 'health')),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Firestore ping timed out')), timeoutMs),
      ),
    ])
    return {
      ok: true,
      configured: true,
      projectId: firebaseConfig.projectId,
      // Missing doc is fine — proves auth + network + rules allow read
      error: result.exists() ? undefined : 'connected (health doc not seeded yet)',
    }
  } catch (err) {
    return {
      ok: false,
      configured: true,
      projectId: firebaseConfig.projectId,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}
