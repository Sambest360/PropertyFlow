/**
 * Vercel Node serverless entry for all `/api/*` routes.
 * vercel.json rewrites nested paths (e.g. /api/auth/login) here — catch-all
 * api/[[...route]].ts only matches single-level paths on non-Next.js projects.
 * Same Hono app as local `tsx server/index.ts`.
 */
import { handle } from 'hono/vercel'
import app from '../server/index.js'

export default handle(app)
