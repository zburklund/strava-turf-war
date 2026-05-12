'use client'

import 'maplibre-gl/dist/maplibre-gl.css'
import { useEffect, useRef, useState, useCallback } from 'react'
import type { Map as MapLibreMap, MapMouseEvent, Popup } from 'maplibre-gl'

// MapLibre must be dynamically imported — it references browser APIs at module level
const MAPLIBRE_STYLE = 'https://demotiles.maplibre.org/style.json'
const POLL_INTERVAL_MS = 60_000

interface TerritoryProperties {
  id: string
  area_sqm: number
  captured_at: string | null
  user_id: string | null
  user_name: string
  user_color: string
}

interface PlayerStats {
  user_id: string
  user_name: string
  user_color: string
  total_area_sqm: number
  territory_count: number
}

interface Props {
  initialTerritories: GeoJSON.FeatureCollection
  currentUserId: string
  currentUserName: string
  currentUserColor: string
}

function formatArea(sqm: number): string {
  if (sqm >= 1_000_000) return `${(sqm / 1_000_000).toFixed(2)} km²`
  return `${(sqm / 1_000).toFixed(2)} km² (${Math.round(sqm).toLocaleString()} m²)`
}

function computePlayerStats(
  geoJSON: GeoJSON.FeatureCollection
): PlayerStats[] {
  const map = new Map<string, PlayerStats>()
  for (const f of geoJSON.features) {
    const p = f.properties as TerritoryProperties
    if (!p.user_id) continue
    if (!map.has(p.user_id)) {
      map.set(p.user_id, {
        user_id: p.user_id,
        user_name: p.user_name,
        user_color: p.user_color,
        total_area_sqm: 0,
        territory_count: 0,
      })
    }
    const entry = map.get(p.user_id)!
    entry.total_area_sqm += p.area_sqm ?? 0
    entry.territory_count += 1
  }
  return Array.from(map.values()).sort(
    (a, b) => b.total_area_sqm - a.total_area_sqm
  )
}

export default function MapClient({
  initialTerritories,
  currentUserId,
  currentUserName,
  currentUserColor,
}: Props) {
  const mapContainer = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const popupRef = useRef<Popup | null>(null)
  const hoveredIdRef = useRef<string | number | undefined>(undefined)
  const [territories, setTerritories] =
    useState<GeoJSON.FeatureCollection>(initialTerritories)
  const [playerStats, setPlayerStats] = useState<PlayerStats[]>(
    computePlayerStats(initialTerritories)
  )
  const [mapReady, setMapReady] = useState(false)

  // ── Initialise MapLibre GL ──────────────────────────────────────────────────
  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return

    let map: MapLibreMap
    let MapLibreGL: typeof import('maplibre-gl')

    import('maplibre-gl').then((mod) => {
      MapLibreGL = mod

      map = new MapLibreGL.Map({
        container: mapContainer.current!,
        style: MAPLIBRE_STYLE,
        center: [-98.5795, 39.8283], // geographic centre of the US
        zoom: 4,
      })

      mapRef.current = map

      // Popup for hover tooltips
      popupRef.current = new MapLibreGL.Popup({
        closeButton: false,
        closeOnClick: false,
      })

      map.on('load', () => {
        // ── Territory fill layer ────────────────────────────────────────────
        map.addSource('territories', {
          type: 'geojson',
          data: initialTerritories,
          generateId: true,
        })

        map.addLayer({
          id: 'territories-fill',
          type: 'fill',
          source: 'territories',
          paint: {
            'fill-color': ['get', 'user_color'],
            'fill-opacity': [
              'case',
              ['boolean', ['feature-state', 'hovered'], false],
              0.7,
              0.4,
            ],
          },
        })

        map.addLayer({
          id: 'territories-outline',
          type: 'line',
          source: 'territories',
          paint: {
            'line-color': ['get', 'user_color'],
            'line-width': 1.5,
            'line-opacity': 0.8,
          },
        })

        // ── Hover interaction ───────────────────────────────────────────────
        map.on('mousemove', 'territories-fill', (e: MapMouseEvent & { features?: GeoJSON.Feature[] }) => {
          if (!e.features || e.features.length === 0) return
          map.getCanvas().style.cursor = 'pointer'

          const feature = e.features[0]
          const fid = feature.id as number | string | undefined
          const props = feature.properties as TerritoryProperties

          if (hoveredIdRef.current !== undefined && hoveredIdRef.current !== fid) {
            map.setFeatureState(
              { source: 'territories', id: hoveredIdRef.current },
              { hovered: false }
            )
          }
          if (fid !== undefined) {
            map.setFeatureState(
              { source: 'territories', id: fid },
              { hovered: true }
            )
            hoveredIdRef.current = fid
          }

          const areaSqM = props.area_sqm ?? 0
          popupRef.current!
            .setLngLat(e.lngLat)
            .setHTML(
              `<div style="font-family:sans-serif;font-size:13px;font-weight:600">${props.user_name}</div>
               <div style="font-size:11px;color:#666;margin-top:2px">${formatArea(areaSqM)}</div>`
            )
            .addTo(map)
        })

        map.on('mouseleave', 'territories-fill', () => {
          map.getCanvas().style.cursor = ''
          if (hoveredIdRef.current !== undefined) {
            map.setFeatureState(
              { source: 'territories', id: hoveredIdRef.current },
              { hovered: false }
            )
            hoveredIdRef.current = undefined
          }
          popupRef.current!.remove()
        })

        setMapReady(true)
      })
    })

    return () => {
      mapRef.current?.remove()
      mapRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Sync GeoJSON source when territories state changes ─────────────────────
  useEffect(() => {
    if (!mapReady || !mapRef.current) return
    const source = mapRef.current.getSource('territories') as
      | import('maplibre-gl').GeoJSONSource
      | undefined
    source?.setData(territories)
    setPlayerStats(computePlayerStats(territories))
  }, [territories, mapReady])

  // ── Polling: refresh territories every 60 s ───────────────────────────────
  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/territories', { cache: 'no-store' })
      if (!res.ok) return
      const data: GeoJSON.FeatureCollection = await res.json()
      setTerritories(data)
    } catch {
      // Network error — silently skip this cycle
    }
  }, [])

  useEffect(() => {
    const id = setInterval(refresh, POLL_INTERVAL_MS)
    return () => clearInterval(id)
  }, [refresh])

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="relative h-full w-full">
      {/* Map container */}
      <div ref={mapContainer} className="absolute inset-0" />

      {/* Top-right: current user badge + logout */}
      <div className="absolute top-4 right-4 z-10 flex items-center gap-2 bg-white/90 backdrop-blur rounded-lg shadow px-3 py-2 text-sm">
        <span
          className="inline-block w-3 h-3 rounded-full"
          style={{ background: currentUserColor }}
        />
        <span className="font-medium">{currentUserName}</span>
        <a
          href="/api/auth/logout"
          className="ml-2 text-gray-400 hover:text-gray-700 text-xs underline"
        >
          Sign out
        </a>
      </div>

      {/* Bottom-left: leaderboard */}
      <div className="absolute bottom-8 left-4 z-10 bg-white/90 backdrop-blur rounded-lg shadow p-3 min-w-[200px]">
        <h2 className="text-xs font-bold uppercase text-gray-500 mb-2 tracking-wider">
          Leaderboard
        </h2>
        {playerStats.length === 0 ? (
          <p className="text-xs text-gray-400 italic">
            No territories claimed yet
          </p>
        ) : (
          <ol className="space-y-1">
            {playerStats.slice(0, 10).map((p, i) => (
              <li key={p.user_id} className="flex items-center gap-2 text-sm">
                <span className="text-gray-400 text-xs w-4">{i + 1}</span>
                <span
                  className="inline-block w-3 h-3 rounded-full flex-shrink-0"
                  style={{ background: p.user_color }}
                />
                <span
                  className={
                    p.user_id === currentUserId ? 'font-bold' : ''
                  }
                >
                  {p.user_name}
                </span>
                <span className="ml-auto text-xs text-gray-500">
                  {(p.total_area_sqm / 1_000_000).toFixed(2)} km²
                </span>
              </li>
            ))}
          </ol>
        )}
        <p className="text-xs text-gray-300 mt-3">
          Refreshes every 60 s
        </p>
      </div>

      {/* MapLibre attribution is handled by the style itself */}
    </div>
  )
}
