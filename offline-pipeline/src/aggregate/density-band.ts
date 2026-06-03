/** Human-readable band; exact count for small values so hover matches colour. */
export function densityBandLabel(count: number, k: number): string {
  if (count >= 20) return "20+ addresses in area";
  if (count >= 15) return "15–19 addresses in area";
  if (count >= 12) return "12–14 addresses in area";
  if (count >= 10) return "10–11 addresses in area";
  if (count >= k) return `${count} addresses in area`;
  return `${k}+addresses in area`;
}
