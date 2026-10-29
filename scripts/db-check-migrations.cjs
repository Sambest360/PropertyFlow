#!/usr/bin/env node
/**
 * Read-only: which tables, columns and functions from database/postgres/migrations
 * are missing in DATABASE_URL. Only SELECTs against the catalog; changes nothing.
 *
 *   node --env-file=.env scripts/db-check-migrations.cjs
 *
 * "API" marks objects the server/ code references, so a missing one can break
 * loads or writes; the rest are Supabase-only (RPCs, auth hooks) and can be ignored.
 */
const fs = require('fs')
const path = require('path')
const { Client } = require('pg')

const root = path.join(__dirname, '..')
const dir = path.join(root, 'database/postgres/migrations')
const serverSrc = fs
  .readdirSync(path.join(root, 'server'))
  .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))
  .map((f) => fs.readFileSync(path.join(root, 'server', f), 'utf8'))
  .join('\n')
  // Comments mention migrations by name; only code references count.
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:])\/\/[^\n]*/g, '$1')
const usedByApi = (name) => new RegExp(`\\b${name}\\b`).test(serverSrc)

const stripComments = (sql) => sql.replace(/--[^\n]*/g, '')

function objectsIn(sql) {
  const tables = new Set()
  const functions = new Set()
  const columns = new Set() // "table.column"
  for (const m of sql.matchAll(/CREATE TABLE(?: IF NOT EXISTS)? (?:public\.)?([a-z_]+)/gi)) tables.add(m[1].toLowerCase())
  for (const m of sql.matchAll(/CREATE (?:OR REPLACE )?FUNCTION (?:public\.)?([a-z_]+)/gi)) functions.add(m[1].toLowerCase())
  for (const stmt of sql.split(';')) {
    const t = /ALTER TABLE(?: IF EXISTS)?(?: ONLY)? (?:public\.)?([a-z_]+)/i.exec(stmt)
    if (!t) continue
    for (const c of stmt.matchAll(/ADD COLUMN(?: IF NOT EXISTS)? ([a-z_]+)/gi)) {
      columns.add(`${t[1].toLowerCase()}.${c[1].toLowerCase()}`)
    }
  }
  return { tables, functions, columns }
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set (run with --env-file=.env)')
  const c = new Client({ connectionString: process.env.DATABASE_URL })
  await c.connect()
  const tables = new Set(
    (await c.query(`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`)).rows.map((r) => r.table_name),
  )
  const columns = new Set(
    (await c.query(`SELECT table_name || '.' || column_name AS k FROM information_schema.columns WHERE table_schema = 'public'`)).rows.map((r) => r.k),
  )
  const functions = new Set(
    (await c.query(`SELECT p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public'`)).rows.map((r) => r.proname),
  )
  await c.end()

  let apiMissing = 0
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
    const o = objectsIn(stripComments(fs.readFileSync(path.join(dir, file), 'utf8')))
    const missing = [
      ...[...o.tables].filter((t) => !tables.has(t)).map((t) => ({ kind: 'table', name: t, api: usedByApi(t) })),
      // A column on a table this migration also creates is reported with the table.
      ...[...o.columns]
        .filter((k) => !columns.has(k) && !o.tables.has(k.split('.')[0]))
        .map((k) => ({ kind: 'column', name: k, api: usedByApi(k.split('.')[1]) })),
      ...[...o.functions].filter((f) => !functions.has(f)).map((f) => ({ kind: 'function', name: f, api: usedByApi(f) })),
    ]
    if (!missing.length) {
      // A data fix (UPDATE/DELETE/INSERT/DO block) leaves nothing this script can
      // look up, so "ok" would only mean "nothing to check" - say so instead.
      const objects = o.tables.size + o.functions.size + o.columns.size
      const sqlText = stripComments(fs.readFileSync(path.join(dir, file), 'utf8'))
      if (!objects && /\bUPDATE\s+[a-z_.]+\s+SET\b|\bDELETE\s+FROM\b/i.test(sqlText)) {
        console.log(`DATA     ${file}  (changes existing rows; cannot tell if it ran - check by hand)`)
      } else {
        console.log(`ok       ${file}`)
      }
      continue
    }
    console.log(`MISSING  ${file}`)
    for (const m of missing) {
      if (m.api) apiMissing++
      console.log(`           ${m.api ? 'API ' : '    '} ${m.kind} ${m.name}`)
    }
  }
  console.log(apiMissing ? `\n${apiMissing} missing object(s) the API uses.` : '\nNothing the API uses is missing.')
}

main().catch((e) => {
  console.error('FAILED:', e.message)
  process.exit(1)
})
