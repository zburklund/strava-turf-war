import { createServiceClient } from '@/lib/supabase/service'

export interface StravaActivity {
  id: number
  name: string
  distance: number
  start_date: string
  map: {
    summary_polyline: string
    polyline?: string
  }
  type: string
  sport_type: string
}

export interface StravaAthlete {
  id: number
  username: string
  firstname: string
  lastname: string
  profile: string // profile image URL
}

export interface StravaTokenResponse {
  access_token: string
  refresh_token: string
  expires_at: number
  athlete?: StravaAthlete
}

/**
 * Exchange an OAuth authorisation code for Strava tokens + athlete info.
 */
export async function exchangeStravaCode(
  code: string
): Promise<StravaTokenResponse> {
  const res = await fetch('https://www.strava.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: process.env.STRAVA_CLIENT_ID,
      client_secret: process.env.STRAVA_CLIENT_SECRET,
      code,
      grant_type: 'authorization_code',
    }),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Strava token exchange failed: ${res.status} ${text}`)
  }

  return res.json()
}

/**
 * Refresh a user's Strava access token if it has expired.
 * Updates the user row in Supabase and returns a fresh access token.
 */
export async function refreshStravaToken(userId: string): Promise<string> {
  const supabase = createServiceClient()

  const { data: user, error } = await supabase
    .from('users')
    .select('access_token, refresh_token, token_expires_at')
    .eq('id', userId)
    .single()

  if (error || !user) {
    throw new Error(`User not found: ${userId}`)
  }

  const now = Math.floor(Date.now() / 1000)
  const expiresAt = user.token_expires_at
    ? Math.floor(new Date(user.token_expires_at).getTime() / 1000)
    : 0

  // Token still valid — return as-is
  if (expiresAt > now + 60) {
    return user.access_token as string
  }

  // Refresh
  const res = await fetch('https://www.strava.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: process.env.STRAVA_CLIENT_ID,
      client_secret: process.env.STRAVA_CLIENT_SECRET,
      grant_type: 'refresh_token',
      refresh_token: user.refresh_token,
    }),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Strava token refresh failed: ${res.status} ${text}`)
  }

  const tokens: StravaTokenResponse = await res.json()

  // Persist refreshed tokens
  await supabase
    .from('users')
    .update({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      token_expires_at: new Date(tokens.expires_at * 1000).toISOString(),
    })
    .eq('id', userId)

  return tokens.access_token
}

/**
 * Fetch a single Strava activity by ID.
 */
export async function getStravaActivity(
  activityId: number,
  accessToken: string
): Promise<StravaActivity> {
  const res = await fetch(
    `https://www.strava.com/api/v3/activities/${activityId}?include_all_efforts=false`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  )

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Strava activity fetch failed: ${res.status} ${text}`)
  }

  return res.json()
}

/**
 * Fetch the authenticated athlete's profile.
 */
export async function getStravaAthlete(
  accessToken: string
): Promise<StravaAthlete> {
  const res = await fetch('https://www.strava.com/api/v3/athlete', {
    headers: { Authorization: `Bearer ${accessToken}` },
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Strava athlete fetch failed: ${res.status} ${text}`)
  }

  return res.json()
}
