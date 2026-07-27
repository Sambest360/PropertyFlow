/**
 * Vercel Node serverless catch-all for `/api/*`.
 * Same Hono app as local `tsx server/index.ts`.
 */
import { handle } from 'hono/vercel'
import app from '../server/index.js'

export default handle(app)
