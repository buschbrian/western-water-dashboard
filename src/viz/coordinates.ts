/** A point formatted for reading and for pasting into another map. */
export interface CoordinateText {
  decimal: string;
  dms: string;
  /** Latitude, longitude: the order most coordinate search boxes accept. */
  copy: string;
}

function direction(value: number, positive: string, negative: string): string {
  return value < 0 ? negative : positive;
}

function dms(value: number, positive: string, negative: string): string {
  /* Round the whole angle first. That carries 59.95 seconds into the next
   * minute, instead of rendering an impossible 60.0-second component. */
  const totalTenths = Math.round(Math.abs(value) * 3600 * 10);
  const degrees = Math.floor(totalTenths / 36000);
  const afterDegrees = totalTenths - degrees * 36000;
  const minutes = Math.floor(afterDegrees / 600);
  const seconds = (afterDegrees - minutes * 600) / 10;
  return `${degrees}° ${minutes}′ ${seconds.toFixed(1)}″ `
    + direction(value, positive, negative);
}

/**
 * Decimal degrees and degrees-minutes-seconds for a valid WGS84 point.
 *
 * The arguments follow the payload's named fields, latitude then longitude.
 * GeoJSON reverses that order at its own serialization boundary.
 */
export function coordinateText(lat: number, lon: number): CoordinateText | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)
    || lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
  const latDirection = direction(lat, "N", "S");
  const lonDirection = direction(lon, "E", "W");
  return {
    decimal: `${Math.abs(lat).toFixed(5)}° ${latDirection}, `
      + `${Math.abs(lon).toFixed(5)}° ${lonDirection}`,
    dms: `${dms(lat, "N", "S")}, ${dms(lon, "E", "W")}`,
    copy: `${lat.toFixed(5)}, ${lon.toFixed(5)}`
  };
}
