import { neon } from '@neondatabase/serverless'

/**
 * Neon Postgres client (one-shot queries over HTTP). Connects as the database
 * owner, so use ONLY in server-side code (API routes, server components,
 * webhook handlers). Never expose to the browser.
 *
 * Usage: const sql = db(); const rows = await sql`select ... where id = ${id}`
 * Interpolated values are sent as query parameters, not spliced into the SQL.
 */
export function db() {
  return neon(process.env.DATABASE_URL!)
}
