# strava-turf-war

A multiplayer territory-control game built on Strava activity data. When a user completes a ride whose route self-intersects, the enclosed area becomes their territory on a shared map. Other users can steal territory by riding routes that enclose ≥50% of an existing polygon.

## Tech stack

- **Next.js 16** (App Router, TypeScript, Turbopack)
- **Neon** (serverless Postgres + PostGIS) — geospatial territory storage, queried with `@neondatabase/serverless`
- **MapLibre GL** — free tile map, no API key required
- **Turf.js** (`@turf/turf`) — polygon math (polygonize, kinks, intersect, area)
- **Strava OAuth + Webhooks** — authentication and automatic ride ingestion
- **Bun** — package manager (used on Vercel; npm locally)
- **Vercel** — deployment target

## Project structure

```
app/
  page.tsx                        # Landing page (server component, checks session cookie)
  layout.tsx                      # Root layout
  map/
    page.tsx                      # Map page (server component — fetches territories SSR, auth guard)
    MapClient.tsx                 # MapLibre GL client component ('use client')
  api/
    auth/
      strava/route.ts             # GET → redirects to Strava OAuth authorize URL
      strava/callback/route.ts    # GET → exchanges code, upserts user, sets cookie, redirects /map
      logout/route.ts             # GET+POST → clears session cookie
    territories/route.ts          # GET → GeoJSON FeatureCollection of all territories
    webhooks/strava/route.ts      # GET (challenge) + POST (ride ingestion)

lib/
  territory.ts                    # Core polygon algorithm + WKT helpers
  strava.ts                       # Token exchange, token refresh, activity fetch
  db.ts                           # Neon SQL client (db() → tagged-template sql) — server only

db/
  schema.sql                      # PostGIS schema: users, rides, territories + spatial indexes

types/
  mapbox__polyline.d.ts           # Hand-written type declarations for @mapbox/polyline
```

## Authentication

Custom OAuth flow using Strava directly. Session is stored as a plain `strava_turf_user_id` cookie containing the `users.id` UUID. The cookie is `httpOnly`, `sameSite: lax`, 30-day expiry.

`lib/db.ts` connects as the database owner — there is no RLS. Import it only from server code (API routes, server components); never from client components.

## Territory algorithm (`lib/territory.ts`)

The core mechanic lives in `extractTerritoryPolygons(coordinates: [number, number][])`:

1. Build a LineString from `[lng, lat]` coordinate pairs.
2. Use `turf.kinks()` to detect self-intersections. If none → return `[]`.
3. Iteratively split the line at each kink point using `turf.lineSplit()` to build a planar edge network.
4. Feed the network to `turf.polygonize()` to extract minimal enclosed rings.
5. Filter out slivers smaller than 5,000 m² (~50×100 m city block).

Territory stealing uses `findStolenTerritories()`: for each existing territory, compute the intersection area with the new polygon; if ≥50% of the existing territory is covered, it's stolen.

**Important coordinate convention**: Strava polylines decode to `[lat, lng]`. All internal code uses `[lng, lat]` (GeoJSON / Turf convention). The swap happens once at ingestion in the webhook handler.

## Strava webhook flow

`POST /api/webhooks/strava`:
1. Verify event is `aspect_type: create` + `object_type: activity`.
2. Look up user by `strava_athlete_id`.
3. Refresh token if expired (`lib/strava.ts → refreshStravaToken`).
4. Fetch activity detail from Strava API — decode `map.summary_polyline` using `@mapbox/polyline`.
5. Upsert ride into `rides` table (WKT LineString via `SRID=4326;LINESTRING(...)`).
6. Run `extractTerritoryPolygons()`.
7. For each new polygon: query intersecting territories, determine stolen ones, delete them, insert new territory.

`GET /api/webhooks/strava`: Strava subscription verification — echoes back `hub.challenge` if `hub.verify_token` matches `STRAVA_WEBHOOK_VERIFY_TOKEN`.

## Database schema (key points)

- `territories.polygon` is `geometry(Polygon, 4326)` — PostGIS type, SRID 4326 (WGS84).
- `territories.area_sqm` is a generated column: `ST_Area(polygon::geography)` — uses geography cast for accurate metre-based area.
- Insert polygons as WKT with SRID prefix: `SRID=4326;POLYGON((...))`.
- Select geometry as `ST_AsGeoJSON(col)::json` — the driver then returns a GeoJSON object. A bare geometry column comes back as hex EWKB.
- Spatial index on `territories(polygon)` and `rides(route)` using GiST.

## MapLibre GL map (`app/map/MapClient.tsx`)

- Must be `'use client'` — MapLibre references browser APIs at module level.
- `maplibre-gl` is in `serverExternalPackages` in `next.config.ts` to prevent server bundling.
- MapLibre CSS imported at top of the file: `import 'maplibre-gl/dist/maplibre-gl.css'`.
- Map style: `https://demotiles.maplibre.org/style.json` (free, no key).
- Territory hover state uses MapLibre `feature-state` (not re-renders) for performance.
- Hovering uses a `useRef` (not `useState`) for the hovered feature ID so the map event closure always has the current value.
- Territories auto-poll via `setInterval` every 60 seconds hitting `GET /api/territories`.

## Environment variables

| Variable | Description |
|---|---|
| `DATABASE_URL` | Neon pooled connection string (server only) |
| `STRAVA_CLIENT_ID` | Strava API application client ID |
| `STRAVA_CLIENT_SECRET` | Strava API application client secret |
| `STRAVA_WEBHOOK_VERIFY_TOKEN` | Shared secret for webhook verification (default: `strava-turf-war-webhook-secret`) |
| `NEXT_PUBLIC_APP_URL` | Full app URL — `http://localhost:3000` locally, Vercel URL in production |

## Deployment

Deployed on Vercel. Uses `bun install` as the install command to avoid npm/pnpm compatibility issues with Tailwind v4's native oxide packages. See `vercel.json`.

To register the Strava webhook after deploying:
```bash
curl -X POST https://www.strava.com/api/v3/push_subscriptions \
  -F client_id=YOUR_CLIENT_ID \
  -F client_secret=YOUR_CLIENT_SECRET \
  -F callback_url=https://YOUR_DOMAIN/api/webhooks/strava \
  -F verify_token=strava-turf-war-webhook-secret
```

## Common tasks

**Change the schema**: edit `db/schema.sql` for fresh setups, and apply the change to the live database with `psql "$DATABASE_URL"` (or the Neon console SQL editor).

**Test the webhook locally**: use the [Strava CLI](https://developers.strava.com/docs/webhooks/) or manually POST to `localhost:3000/api/webhooks/strava` with a fake payload.

**Check territory capture logic**: `lib/territory.ts` is pure TypeScript with no side effects — easy to unit test with sample coordinate arrays.

**Run locally**:
```bash
npm run dev   # or: bun dev
```
