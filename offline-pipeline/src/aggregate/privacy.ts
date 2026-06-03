export function applyCountNoise(count: number, maxDelta: number): number {
  if (maxDelta <= 0) return count;
  const delta = Math.floor(Math.random() * (2 * maxDelta + 1)) - maxDelta;
  return Math.max(0, count + delta);
}

export function suppressBelowK(
  counts: Map<string, number>,
  k: number,
): Map<string, number> {
  const out = new Map<string, number>();
  for (const [cellId, count] of counts) {
    if (count >= k) out.set(cellId, count);
  }
  return out;
}
