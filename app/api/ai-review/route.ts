import { consumeAnalysisRateLimit } from "@/lib/ai/rate-limit";
import { handleAnalysisPost } from "@/lib/ai/review-request";
import { createAnalysisProvider, readAnalysisTimeoutMs } from "@/lib/ai/provider";

export async function POST(request: Request): Promise<Response> {
  return handleAnalysisPost(request, {
    provider: createAnalysisProvider(process.env),
    allowRequest: () => consumeAnalysisRateLimit(),
    timeoutMs: readAnalysisTimeoutMs(process.env),
  });
}
