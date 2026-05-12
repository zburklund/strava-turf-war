import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createServiceClient } from '@/lib/supabase/service'
import MapClient from './MapClient'

interface TerritoryRow {
  id: string
  polygon: unknown
  area_sqm: number | null
  captured_at: string | null
  users: { id: string; display_name: string | null; color: string } | null
}

export default async function MapPage() {
  // Auth check
  const cookieStore = await cookies()
  const userId = cookieStore.get('strava_turf_user_id')?.value
  if (!userId) {
    redirect('/')
  }

  // Server-side fetch of all territories for SSR
  const supabase = createServiceClient()
  const { data: rows } = await supabase
    .from('territories')
    .select(`
      id,
      polygon,
      area_sqm,
      captured_at,
      users (
        id,
        display_name,
        color
      )
    `)

  const features = ((rows ?? []) as unknown as TerritoryRow[])
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
      if (!geometry) return null

      return {
        type: 'Feature' as const,
        geometry,
        properties: {
          id: row.id,
          area_sqm: row.area_sqm ?? 0,
          captured_at: row.captured_at,
          user_id: row.users?.id ?? null,
          user_name: row.users?.display_name ?? 'Unknown',
          user_color: row.users?.color ?? '#888888',
        },
      }
    })
    .filter(Boolean) as GeoJSON.Feature[]

  const initialGeoJSON: GeoJSON.FeatureCollection = {
    type: 'FeatureCollection',
    features,
  }

  // Fetch current user info for the UI
  const { data: currentUser } = await supabase
    .from('users')
    .select('id, display_name, color, profile_image_url')
    .eq('id', userId)
    .single()

  return (
    <main className="h-screen w-screen overflow-hidden flex flex-col">
      <MapClient
        initialTerritories={initialGeoJSON}
        currentUserId={userId}
        currentUserName={currentUser?.display_name ?? 'You'}
        currentUserColor={currentUser?.color ?? '#3b82f6'}
      />
    </main>
  )
}
