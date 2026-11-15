const WINDOW_MS = 10 * 60 * 1000;
const MAX_REQUESTS = 10;

function createRequestBucket() {
  const hits: number[] = [];
  return {
    consume(now = Date.now()): boolean {
      const cutoff = now - WINDOW_MS;
      while (hits.length > 0 && hits[0] < cutoff) hits.shift();
      if (hits.length >= MAX_REQUESTS) return false;
      hits.push(now);
      return true;
    },
    reset(): void {
      hits.length = 0;
    },
  };
}

const analysisRequests = createRequestBucket();
const writingRequests = createRequestBucket();

export function consumeAnalysisRateLimit(now = Date.now()): boolean {
  return analysisRequests.consume(now);
}

export function resetAnalysisRateLimit(): void {
  analysisRequests.reset();
}

export function consumeWritingRateLimit(now = Date.now()): boolean {
  return writingRequests.consume(now);
}

export function resetWritingRateLimit(): void {
  writingRequests.reset();
}
