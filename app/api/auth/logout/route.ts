import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'

/**
 * POST /api/auth/logout
 * Clears the session cookie and redirects to the home page.
 */
export async function POST() {
  const cookieStore = await cookies()
  cookieStore.delete('strava_turf_user_id')
  return NextResponse.redirect(
    `${process.env.NEXT_PUBLIC_APP_URL ?? ''}/`
  )
}

/** Support GET for simple <a href="/api/auth/logout"> links */
export async function GET() {
  const cookieStore = await cookies()
  cookieStore.delete('strava_turf_user_id')
  return NextResponse.redirect(
    `${process.env.NEXT_PUBLIC_APP_URL ?? ''}/`
  )
}
