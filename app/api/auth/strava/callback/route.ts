import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServiceClient } from '@/lib/supabase/service'
import {
  exchangeStravaCode,
  getStravaAthlete,
} from '@/lib/strava'

/**
 * GET /api/auth/strava/callback
 * Handles the OAuth callback from Strava:
 *  1. Exchange the code for tokens
 *  2. Fetch the athlete profile
 *  3. Upsert the user in Supabase
 *  4. Set a session cookie
 *  5. Redirect to /map
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const error = searchParams.get('error')

  if (error || !code) {
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/?error=strava_auth_denied`
    )
  }

  try {
    // Exchange authorisation code for tokens
    const tokens = await exchangeStravaCode(code)

    // Fetch full athlete profile (the token exchange returns a partial one;
    // calling /athlete gives us the complete object)
    const athlete = await getStravaAthlete(tokens.access_token)

    // Upsert user in Supabase
    const supabase = createServiceClient()
    const { data: user, error: upsertError } = await supabase
      .from('users')
      .upsert(
        {
          strava_athlete_id: athlete.id,
          username: athlete.username ?? null,
          display_name: `${athlete.firstname} ${athlete.lastname}`.trim(),
          profile_image_url: athlete.profile ?? null,
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
          token_expires_at: new Date(tokens.expires_at * 1000).toISOString(),
        },
        { onConflict: 'strava_athlete_id' }
      )
      .select('id')
      .single()

    if (upsertError || !user) {
      console.error('Failed to upsert user:', upsertError)
      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_APP_URL}/?error=db_error`
      )
    }

    // Set a simple session cookie containing the user's UUID.
    // In production you would sign this with a secret; for an MVP this is fine.
    const cookieStore = await cookies()
    cookieStore.set('strava_turf_user_id', user.id, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 30, // 30 days
      path: '/',
    })

    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/map`)
  } catch (err) {
    console.error('Strava callback error:', err)
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/?error=internal_error`
    )
  }
}
