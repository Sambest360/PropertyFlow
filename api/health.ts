/**
 * Standalone Vercel function — /api/health (matched before rewrite).
 * Use ?db=0 for instant config check without opening a Postgres connection.
 */
export default async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url)
  const at = new Date().toISOString()
  const configured = Boolean(process.env.DATABASE_URL?.trim())

  if (url.searchParams.get('db') === '0') {
    return Response.json(
      {
        ok: configured,
        database: configured ? 'configured' : 'unconfigured',
        vercel: Boolean(process.env.VERCEL),
        at,
      },
      { status: configured ? 200 : 503 },
    )
  }

  if (!configured) {
    return Response.json(
      {
        ok: false,
        database: 'unconfigured',
        error: 'DATABASE_URL is not set on Vercel',
        at,
      },
      { status: 503 },
    )
  }

  try {
    const { pingDatabase, databaseConfigWarning } = await import('../server/db.js')
    await pingDatabase(4_000)
    return Response.json({
      ok: true,
      database: 'up',
      warning: databaseConfigWarning,
      at,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return Response.json(
      {
        ok: false,
        database: 'down',
        error: message,
        hint: 'Use Supabase Transaction pooler port 6543 in DATABASE_URL, then redeploy.',
        at,
      },
      { status: 503 },
    )
  }
}

export const config = {
  runtime: 'nodejs',
  maxDuration: 15,
}
