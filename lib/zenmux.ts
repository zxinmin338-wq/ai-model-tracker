/**
 * ZenMux model usage data fetcher.
 *
 * ZenMux exposes a public, stateless frontend endpoint that returns daily-level
 * token usage for all models under an author (slug). No auth is required: the
 * `ctoken` query param the browser sends is NOT validated server-side, so we
 * simply omit it.
 *
 * Response shape (day-bucketed, one model array per day):
 *   { success: true, data: { "20260504": [{ model_slug, tokens }], ... } }
 *
 * Notes vs. other sources:
 *  - Only tokens are provided; there is no request count (total_requests = null).
 *  - No free/standard distinction; all data is treated as total (is_free=false).
 *  - model_slug carries a `baidu/` prefix, e.g. "baidu/ernie-5.1".
 */

const BASE_URL =
  "https://zenmux.ai/api/frontend/model/analysis/tokens/day/ByAuthorSlug";

interface ZenMuxDayRecord {
  model_slug: string;
  tokens: number;
}

export interface ZenMuxUsageRecord {
  model_slug: string; // raw slug incl. author prefix, e.g. "baidu/ernie-5.1"
  usage_date: string; // YYYY-MM-DD
  total_tokens: number;
}

/** Convert a "20260504" day key into "2026-05-04". */
function normalizeDayKey(key: string): string | null {
  if (!/^\d{8}$/.test(key)) return null;
  return `${key.slice(0, 4)}-${key.slice(4, 6)}-${key.slice(6, 8)}`;
}

/**
 * Fetch daily per-model token usage for an author from ZenMux.
 *
 * Flattens the day-bucketed response into a flat list of
 * (model_slug, usage_date, total_tokens) records. One request returns every
 * model under the slug.
 */
export async function fetchZenMuxActivity(
  slug: string = "baidu",
  day: number = 30
): Promise<ZenMuxUsageRecord[]> {
  // ctoken intentionally omitted — not validated server-side.
  const url = `${BASE_URL}?slug=${encodeURIComponent(slug)}&day=${day}`;

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

      const data: Record<string, ZenMuxDayRecord[]> = json.data;
      const out: ZenMuxUsageRecord[] = [];

      for (const dayKey of Object.keys(data)) {
        const usage_date = normalizeDayKey(dayKey);
        if (!usage_date) continue;

        for (const rec of data[dayKey] ?? []) {
          if (!rec?.model_slug) continue;
          out.push({
            model_slug: rec.model_slug,
            usage_date,
            total_tokens: rec.tokens ?? 0,
          });
        }
      }

      return out;
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
      if (attempt < 2) {
        await new Promise((resolve) =>
          setTimeout(resolve, 2 ** attempt * 1000)
        );
      }
    }
  }
  throw lastError ?? new Error("fetchZenMuxActivity failed");
}

/**
 * Map a raw ZenMux model_slug to the permaslug used in our `models` table.
 *
 * Explicit overrides handle slugs that don't follow the "drop author prefix"
 * rule — notably "baidu/ernie-5.1", which must reuse the EXISTING "ernie-5.1"
 * row (created during AnyInt onboarding) rather than create a duplicate.
 *
 * Everything else maps by stripping the "<author>/" prefix, e.g.
 * "baidu/ernie-5.0-thinking-preview" -> "ernie-5.0-thinking-preview".
 */
export const ZENMUX_PERMASLUG_OVERRIDES: Record<string, string> = {
  "baidu/ernie-5.1": "ernie-5.1",
};

export function zenmuxPermaslug(modelSlug: string): string {
  return (
    ZENMUX_PERMASLUG_OVERRIDES[modelSlug] ??
    modelSlug.replace(/^[^/]+\//, "")
  );
}
