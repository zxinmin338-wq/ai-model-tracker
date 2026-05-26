/**
 * OpenRouter model-activity data fetcher.
 *
 * The model-activity endpoint returns cumulative daily usage data.
 * Data updates approximately every 2-3 hours in batches.
 * Dates in the response are UTC.
 */

const BASE_URL =
  "https://openrouter.ai/api/frontend/stats/model-activity";

interface RawRecord {
  date: string;
  count?: number;
  total_prompt_tokens?: number;
  total_completion_tokens?: number;
}

export interface UsageRecord {
  usage_date: string; // YYYY-MM-DD (UTC)
  total_tokens: number;
  total_requests: number;
}

export async function fetchModelActivity(
  permaslug: string,
  variant: string = "free"
): Promise<UsageRecord[]> {
  const url = `${BASE_URL}?permaslug=${encodeURIComponent(permaslug)}${
    variant ? `&variant=${variant}` : ""
  }`;

  const headers: Record<string, string> = {
    "User-Agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
    Accept: "application/json",
  };

  let lastError: Error | null = null;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await fetch(url, { headers, signal: AbortSignal.timeout(45_000) });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }
      const json = await res.json();

      // Handle both { data: { analytics: [...] } } and { data: [...] } shapes
      let records: RawRecord[];
      if (Array.isArray(json?.data?.analytics)) {
        records = json.data.analytics;
      } else if (Array.isArray(json?.data)) {
        records = json.data;
      } else {
        records = [];
      }

      return records
        .filter((r) => r.date)
        .map((r) => ({
          usage_date: r.date.slice(0, 10), // YYYY-MM-DD
          total_tokens:
            (r.total_prompt_tokens ?? 0) + (r.total_completion_tokens ?? 0),
          total_requests: r.count ?? 0,
        }));
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
      if (attempt < 3) {
        await new Promise((resolve) =>
          setTimeout(resolve, 2 ** attempt * 1000)
        );
      }
    }
  }
  throw lastError ?? new Error("fetchModelActivity failed");
}
