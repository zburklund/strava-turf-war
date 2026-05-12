import { NextResponse } from 'next/server'

/**
 * GET /api/auth/strava
 * Redirects the user to Strava's OAuth authorization page.
 */
export async function GET() {
  const params = new URLSearchParams({
    client_id: process.env.STRAVA_CLIENT_ID!,
    redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/strava/callback`,
    response_type: 'code',
    approval_prompt: 'auto',
    scope: 'read,activity:read',
  })

  const stravaAuthUrl = `https://www.strava.com/oauth/authorize?${params.toString()}`
  return NextResponse.redirect(stravaAuthUrl)
}
