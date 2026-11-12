const WINDOW_MS = 10 * 60 * 1000;
const MAX_REQUESTS = 10;
const hits: number[] = [];

export function consumeAnalysisRateLimit(now = Date.now()): boolean {
  const cutoff = now - WINDOW_MS;
  while (hits.length > 0 && hits[0] < cutoff) hits.shift();
  if (hits.length >= MAX_REQUESTS) return false;
  hits.push(now);
  return true;
}

export function resetAnalysisRateLimit(): void {
  hits.length = 0;
}
