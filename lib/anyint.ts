/**
 * AnyInt model usage data fetcher.
 *
 * AnyInt provides daily-level usage via a public API (no auth token needed).
 * Data is daily granularity — values are per-day totals, not cumulative.
 * No free/paid distinction; all data is treated as paid (is_free=false).
 */

const BASE_URL = "https://gateway.api.anyint.ai/models";

interface AnyIntDailyRecord {
  date: string;
  promptTokens: number;
  completionTokens: number;
  reasoningTokens: number;
  cachedReadTokens: number;
  cacheWriteTokens: number;
  totalCost: number;
  totalRequests: number;
}

export interface AnyIntUsageRecord {
  usage_date: string; // YYYY-MM-DD
  total_tokens: number;
  total_requests: number;
}

/**
 * Fetch daily usage for a model from AnyInt.
 *
 * Token calculation: promptTokens + completionTokens + reasoningTokens.
 * cachedReadTokens / cacheWriteTokens are NOT added — they represent
 * cache-served subsets of prompt/completion and would double-count.
 */
export async function fetchAnyIntActivity(
  modelSlug: string
): Promise<AnyIntUsageRecord[]> {
  const url = `${BASE_URL}/${encodeURIComponent(modelSlug)}?lang=en-US`;

  const headers: Record<string, string> = {
    "User-Agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
    Accept: "application/json",
  };

  let lastError: Error | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, {
        headers,
        signal: AbortSignal.timeout(30_000),
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }
      const json = await res.json();

      if (!json?.success || !json?.data) {
        return [];
      }

      const dailyRecords: AnyIntDailyRecord[] =
        json.data.performanceMetrics?.dailyTokenUsage ?? [];

      return dailyRecords
        .filter((r) => r.date && r.totalRequests > 0)
        .map((r) => ({
          usage_date: r.date.slice(0, 10),
          total_tokens:
            (r.promptTokens ?? 0) +
            (r.completionTokens ?? 0) +
            (r.reasoningTokens ?? 0),
          total_requests: r.totalRequests ?? 0,
        }));
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
      if (attempt < 2) {
        await new Promise((resolve) =>
          setTimeout(resolve, 2 ** attempt * 1000)
        );
      }
    }
  }
  throw lastError ?? new Error("fetchAnyIntActivity failed");
}
