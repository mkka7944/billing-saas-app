function isValidLat(n: number) { return isFinite(n) && Math.abs(n) <= 90 }
function isValidLng(n: number) { return isFinite(n) && Math.abs(n) <= 180 }

export function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  if (!isValidLat(lat1) || !isValidLat(lat2) || !isValidLng(lng1) || !isValidLng(lng2)) return Infinity
  const R = 6371000
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}
