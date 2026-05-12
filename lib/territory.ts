import * as turf from '@turf/turf'
import type { Feature, Polygon, LineString, FeatureCollection } from 'geojson'

/** Minimum polygon area in square metres (~50 × 100 m block) */
const MIN_AREA_SQM = 5_000

/**
 * Given a Strava route as an array of [lng, lat] coordinates,
 * returns GeoJSON Polygons for every enclosed interior area the route forms.
 *
 * Algorithm:
 *  1. Build a LineString from the coordinates.
 *  2. Find all self-intersection points with turf.kinks().
 *  3. If there are no kinks the route never crosses itself — no enclosed area.
 *  4. Split the line at every kink using turf.lineSplit() iteratively to produce
 *     a proper planar graph of line segments.
 *  5. Feed the segment collection to turf.polygonize() which extracts all
 *     minimal enclosing rings.
 *  6. Filter out slivers smaller than MIN_AREA_SQM and any non-Polygon geometry.
 */
export function extractTerritoryPolygons(
  coordinates: [number, number][]
): Feature<Polygon>[] {
  if (coordinates.length < 4) return []

  const line = turf.lineString(coordinates)

  // Detect self-intersections
  const kinked = turf.kinks(line)
  if (kinked.features.length === 0) {
    // Route never crosses itself — no enclosed territory
    return []
  }

  // Split the line at every intersection point to build a planar edge network.
  // turf.lineSplit splits one line at one point; we chain through all kink points.
  let segments: Feature<LineString>[] = [line as Feature<LineString>]

  for (const kinkPoint of kinked.features) {
    const next: Feature<LineString>[] = []
    for (const seg of segments) {
      try {
        const split = turf.lineSplit(seg as Feature<LineString>, kinkPoint)
        if (split.features.length > 0) {
          next.push(...(split.features as Feature<LineString>[]))
        } else {
          next.push(seg)
        }
      } catch {
        next.push(seg)
      }
    }
    segments = next
  }

  const network = turf.featureCollection(segments) as FeatureCollection<LineString>

  // polygonize extracts enclosed rings from a planar line network
  const polygonized = turf.polygonize(network)

  if (!polygonized.features || polygonized.features.length === 0) return []

  return polygonized.features.filter((f): f is Feature<Polygon> => {
    if (!f || f.geometry?.type !== 'Polygon') return false
    try {
      const areaSqM = turf.area(f)
      return areaSqM >= MIN_AREA_SQM
    } catch {
      return false
    }
  })
}

/**
 * Given a newly captured polygon and the full list of existing territories,
 * returns the IDs of territories that the new polygon "steals" — i.e., those
 * that have ≥ 50 % of their area overlapped by the new polygon.
 */
export function findStolenTerritories(
  newPolygon: Feature<Polygon>,
  existingTerritories: { id: string; polygon: Feature<Polygon> }[]
): string[] {
  const stolen: string[] = []

  for (const territory of existingTerritories) {
    try {
      if (!turf.booleanIntersects(newPolygon, territory.polygon)) continue

      const intersection = turf.intersect(
        turf.featureCollection([newPolygon, territory.polygon])
      )
      if (!intersection) continue

      const overlapRatio = turf.area(intersection) / turf.area(territory.polygon)
      if (overlapRatio >= 0.5) stolen.push(territory.id)
    } catch {
      // Skip malformed geometries
      continue
    }
  }

  return stolen
}

/**
 * Convert a PostGIS GeoJSON polygon feature (from Supabase) into a Turf feature.
 * Supabase returns geometry columns as GeoJSON strings or objects.
 */
export function parseSupabasePolygon(
  raw: string | object
): Feature<Polygon> | null {
  try {
    const geom = typeof raw === 'string' ? JSON.parse(raw) : raw
    if (geom.type === 'Polygon') {
      return turf.feature(geom as Polygon)
    }
    if (geom.type === 'Feature' && geom.geometry?.type === 'Polygon') {
      return geom as Feature<Polygon>
    }
    return null
  } catch {
    return null
  }
}

/**
 * Convert an array of [lng, lat] coordinate pairs to a PostGIS WKT LineString.
 * e.g. "LINESTRING(-122.4 37.7, -122.5 37.8)"
 */
export function coordsToWKTLineString(coords: [number, number][]): string {
  const points = coords.map(([lng, lat]) => `${lng} ${lat}`).join(', ')
  return `LINESTRING(${points})`
}

/**
 * Convert a Turf Polygon feature to a PostGIS WKT Polygon string.
 * e.g. "POLYGON((-122.4 37.7, -122.5 37.8, ...))"
 */
export function polygonToWKT(polygon: Feature<Polygon>): string {
  const rings = polygon.geometry.coordinates
  const ringStrings = rings.map(
    (ring) => `(${ring.map(([lng, lat]) => `${lng} ${lat}`).join(', ')})`
  )
  return `POLYGON(${ringStrings.join(', ')})`
}
