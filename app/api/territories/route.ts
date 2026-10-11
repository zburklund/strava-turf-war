import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

/**
 * GET /api/territories
 * Returns all territories as a GeoJSON FeatureCollection.
 * Each feature carries user_color and user_name properties for the map.
 */
export async function GET() {
  const sql = db()

  let data
  try {
    // Polygon comes back as a GeoJSON object and the owner as a nested
    // `users` object — the same shape the old Supabase embedded select gave.
    data = await sql`
      select
        t.id,
        ST_AsGeoJSON(t.polygon)::json as polygon,
        t.area_sqm,
        to_json(t.captured_at)        as captured_at,
        case when u.id is null then null
             else json_build_object('id', u.id, 'display_name', u.display_name, 'color', u.color)
        end                           as users
      from territories t
      left join users u on u.id = t.user_id
    `
  } catch (error) {
    console.error('territories fetch error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch territories' },
      { status: 500 }
    )
  }

  type TerritoryRow = {
    id: string
    polygon: unknown
    area_sqm: number | null
    captured_at: string | null
    users: { id: string; display_name: string | null; color: string } | null
  }

  const features = (data as unknown as TerritoryRow[])
    .map((row) => {
      let geometry: object | null = null
      try {
        geometry =
          typeof row.polygon === 'string'
            ? JSON.parse(row.polygon)
            : row.polygon
      } catch {
        return null
      }

      return {
        type: 'Feature',
        geometry,
        properties: {
          id: row.id,
          area_sqm: row.area_sqm,
          captured_at: row.captured_at,
          user_id: row.users?.id ?? null,
          user_name: row.users?.display_name ?? 'Unknown',
          user_color: row.users?.color ?? '#888888',
        },
      }
    })
    .filter(Boolean)

  return NextResponse.json(
    {
      type: 'FeatureCollection',
      features,
    },
    {
      headers: {
        // Allow the map page to poll without issues
        'Cache-Control': 'no-store',
      },
    }
  )
}
