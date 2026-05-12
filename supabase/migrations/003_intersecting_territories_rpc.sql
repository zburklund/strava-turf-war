-- RPC: Return territories that spatially intersect a given polygon WKT.
-- Called by the webhook handler after a new ride is ingested.
create or replace function get_intersecting_territories(polygon_wkt text)
returns table (
  id               uuid,
  user_id          uuid,
  polygon_geojson  json
)
language sql
security definer
as $$
  select
    t.id,
    t.user_id,
    ST_AsGeoJSON(t.polygon)::json as polygon_geojson
  from territories t
  where ST_Intersects(t.polygon, ST_GeomFromText(polygon_wkt, 4326));
$$;
