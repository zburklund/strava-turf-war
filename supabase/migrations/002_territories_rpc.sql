-- RPC: Return territories as a GeoJSON FeatureCollection
-- Run this after 001_initial.sql
create or replace function get_territories_geojson()
returns json
language sql
security definer
as $$
  select json_build_object(
    'type', 'FeatureCollection',
    'features', coalesce(
      json_agg(
        json_build_object(
          'type',       'Feature',
          'geometry',   ST_AsGeoJSON(t.polygon)::json,
          'properties', json_build_object(
            'id',           t.id,
            'user_id',      t.user_id,
            'display_name', u.display_name,
            'color',        u.color,
            'area_sqm',     t.area_sqm,
            'captured_at',  t.captured_at
          )
        )
      ),
      '[]'::json
    )
  )
  from territories t
  join users u on u.id = t.user_id;
$$;
