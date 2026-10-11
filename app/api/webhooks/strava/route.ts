import { NextRequest, NextResponse } from 'next/server'
import polyline from '@mapbox/polyline'
import { db } from '@/lib/db'
import { refreshStravaToken, getStravaActivity } from '@/lib/strava'
import {
  extractTerritoryPolygons,
  findStolenTerritories,
  coordsToWKTLineString,
  polygonToWKT,
  parseGeoJSONPolygon,
} from '@/lib/territory'
import type { Feature, Polygon } from 'geojson'

const VERIFY_TOKEN = process.env.STRAVA_WEBHOOK_VERIFY_TOKEN!

/**
 * GET /api/webhooks/strava
 * Strava calls this to verify the webhook subscription.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const mode = searchParams.get('hub.mode')
  const token = searchParams.get('hub.verify_token')
  const challenge = searchParams.get('hub.challenge')

  if (mode === 'subscribe' && token === VERIFY_TOKEN && challenge) {
    return NextResponse.json({ 'hub.challenge': challenge })
  }

  return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
}

/**
 * POST /api/webhooks/strava
 * Strava calls this when a new activity is created.
 *
 * Payload shape:
 * {
 *   "aspect_type": "create",
 *   "object_type": "activity",
 *   "object_id": 12345678,   ← activity ID
 *   "owner_id":  67890,      ← athlete ID
 *   ...
 * }
 */
export async function POST(request: NextRequest) {
  let body: {
    aspect_type?: string
    object_type?: string
    object_id?: number
    owner_id?: number
  }

  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // Only process new activities
  if (body.aspect_type !== 'create' || body.object_type !== 'activity') {
    return NextResponse.json({ ok: true })
  }

  const activityId = body.object_id
  const stravaAthleteId = body.owner_id

  if (!activityId || !stravaAthleteId) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  }

  const sql = db()

  // Look up user by Strava athlete ID
  const [user] = await sql`
    select id, access_token, refresh_token, token_expires_at
    from users
    where strava_athlete_id = ${stravaAthleteId}
  `

  if (!user) {
    // Athlete hasn't connected via our app — ignore
    return NextResponse.json({ ok: true })
  }

  // Get a fresh access token (refreshes if needed)
  let accessToken: string
  try {
    accessToken = await refreshStravaToken(user.id)
  } catch (err) {
    console.error('Token refresh failed:', err)
    return NextResponse.json({ ok: true })
  }

  // Fetch the activity detail from Strava
  let activity
  try {
    activity = await getStravaActivity(activityId, accessToken)
  } catch (err) {
    console.error('Activity fetch failed:', err)
    return NextResponse.json({ ok: true })
  }

  const encodedPolyline = activity.map?.summary_polyline
  if (!encodedPolyline) {
    // No GPS data (manual activity, etc.)
    return NextResponse.json({ ok: true })
  }

  // @mapbox/polyline decodes to [[lat, lng], ...] — swap to [lng, lat] for GeoJSON / Turf
  const latLngPairs: [number, number][] = polyline.decode(encodedPolyline)
  const coords: [number, number][] = latLngPairs.map(([lat, lng]) => [lng, lat])

  // Store the ride
  const wktLine = coordsToWKTLineString(coords)
  const [ride] = await sql`
    insert into rides (strava_activity_id, user_id, name, distance_meters, start_date, route)
    values (
      ${activityId},
      ${user.id},
      ${activity.name},
      ${activity.distance},
      ${activity.start_date},
      ${`SRID=4326;${wktLine}`}::geometry
    )
    on conflict (strava_activity_id) do update set
      user_id         = excluded.user_id,
      name            = excluded.name,
      distance_meters = excluded.distance_meters,
      start_date      = excluded.start_date,
      route           = excluded.route
    returning id
  `

  // Compute territory polygons
  const newPolygons = extractTerritoryPolygons(coords)

  if (newPolygons.length === 0) {
    return NextResponse.json({ ok: true, territories_added: 0 })
  }

  // Load all existing territories for overlap checking
  const existingRows = (await sql`
    select id, ST_AsGeoJSON(polygon)::json as polygon
    from territories
  `) as { id: string; polygon: unknown }[]

  const existingTerritories: { id: string; polygon: Feature<Polygon> }[] = existingRows
    .map((row) => {
      const parsed = parseGeoJSONPolygon(row.polygon as string | object)
      if (!parsed) return null
      return { id: row.id, polygon: parsed }
    })
    .filter((x): x is { id: string; polygon: Feature<Polygon> } => x !== null)

  let territoriesAdded = 0

  for (const newPoly of newPolygons) {
    // Determine which existing territories are stolen (>= 50 % overlap)
    const stolenIds = findStolenTerritories(newPoly, existingTerritories)

    // Delete stolen territories
    if (stolenIds.length > 0) {
      await sql`delete from territories where id = any(${stolenIds}::uuid[])`
    }

    // Insert the new territory
    const wktPolygon = polygonToWKT(newPoly)
    let insertError: unknown = null
    try {
      await sql`
        insert into territories (user_id, polygon, source_ride_id)
        values (${user.id}, ${`SRID=4326;${wktPolygon}`}::geometry, ${ride?.id ?? null})
      `
    } catch (err) {
      insertError = err
    }

    if (!insertError) {
      territoriesAdded++
      // Update local list so subsequent polygons in this batch can steal from each other
      // (not strictly necessary for single-ride batches, but correct for edge cases)
      existingTerritories.splice(
        0,
        existingTerritories.length,
        ...existingTerritories.filter((t) => !stolenIds.includes(t.id))
      )
    } else {
      console.error('Failed to insert territory:', insertError)
    }
  }

  return NextResponse.json({ ok: true, territories_added: territoriesAdded })
}
