import { consumeWritingRateLimit } from "@/lib/ai/rate-limit";
import { createAnalysisProvider, readAnalysisTimeoutMs } from "@/lib/ai/provider";
import { handleWritingPost } from "@/lib/ai/writing-request";

export async function POST(request: Request): Promise<Response> {
  return handleWritingPost(request, {
    provider: createAnalysisProvider(process.env),
    allowRequest: () => consumeWritingRateLimit(),
    timeoutMs: readAnalysisTimeoutMs(process.env),
  });
}
