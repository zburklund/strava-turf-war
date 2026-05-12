-- Enable PostGIS extension for geospatial support
create extension if not exists postgis;

-- ============================================================
-- USERS (mirrors Strava athletes)
-- ============================================================
create table users (
  id                 uuid        primary key default gen_random_uuid(),
  strava_athlete_id  bigint      unique not null,
  username           text,
  display_name       text,
  profile_image_url  text,
  access_token       text,
  refresh_token      text,
  token_expires_at   timestamptz,
  color              text        not null default '#' || lpad(to_hex(floor(random() * 16777215)::int), 6, '0'),
  created_at         timestamptz default now()
);

-- ============================================================
-- RIDES ingested from Strava
-- ============================================================
create table rides (
  id                  uuid        primary key default gen_random_uuid(),
  strava_activity_id  bigint      unique not null,
  user_id             uuid        references users(id) on delete cascade,
  name                text,
  distance_meters     float,
  start_date          timestamptz,
  route               geometry(LineString, 4326),
  created_at          timestamptz default now()
);

-- ============================================================
-- TERRITORIES owned by users
-- ============================================================
create table territories (
  id              uuid        primary key default gen_random_uuid(),
  user_id         uuid        references users(id) on delete cascade,
  polygon         geometry(Polygon, 4326) not null,
  area_sqm        float       generated always as (ST_Area(polygon::geography)) stored,
  captured_at     timestamptz default now(),
  source_ride_id  uuid        references rides(id) on delete set null,
  constraint territories_polygon_valid check (ST_IsValid(polygon))
);

-- Spatial indexes for fast overlap / intersection queries
create index territories_polygon_idx on territories using gist(polygon);
create index rides_route_idx         on rides     using gist(route);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
alter table users       enable row level security;
alter table rides       enable row level security;
alter table territories enable row level security;

-- Users: everyone can read profiles; each user writes only their own row
create policy "users_read_all"  on users for select using (true);
create policy "users_write_own" on users for all    using (auth.uid()::text = id::text);

-- Rides: public read (service role handles writes via webhook)
create policy "rides_read_all"  on rides for select using (true);

-- Territories: public read (service role handles writes via webhook)
create policy "territories_read_all" on territories for select using (true);

-- NOTE: The webhook API route uses the service-role key which bypasses RLS entirely.
