/** Random offset in metres (uniform disk) for privacy before aggregation. */
export function jitterCoordinates(
  lat: number,
  lon: number,
  maxMetres: number,
): { lat: number; lon: number } {
  if (maxMetres <= 0) return { lat, lon };

  const angle = Math.random() * 2 * Math.PI;
  const radius = Math.sqrt(Math.random()) * maxMetres;
  const dLat = (radius * Math.cos(angle)) / 111_320;
  const dLon =
    (radius * Math.sin(angle)) /
    (111_320 * Math.cos((lat * Math.PI) / 180));

  return { lat: lat + dLat, lon: lon + dLon };
}
