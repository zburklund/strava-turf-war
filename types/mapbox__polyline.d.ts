declare module '@mapbox/polyline' {
  /**
   * Decode an encoded polyline string into an array of [lat, lng] pairs.
   */
  export function decode(str: string, precision?: number): [number, number][];

  /**
   * Encode an array of [lat, lng] pairs into a polyline string.
   */
  export function encode(coordinates: [number, number][], precision?: number): string;

  /**
   * Convert a GeoJSON LineString or Polygon geometry to an encoded polyline.
   */
  export function fromGeoJSON(geojson: object, precision?: number): string;

  /**
   * Convert an encoded polyline to a GeoJSON LineString geometry.
   */
  export function toGeoJSON(str: string, precision?: number): object;
}
