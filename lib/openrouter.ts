/**
 * OpenRouter model-activity data fetcher.
 *
 * The model-activity endpoint returns cumulative daily usage data.
 * Data updates approximately every 2-3 hours in batches.
 * Dates in the response are UTC.
 */

const BASE_URL =
  "https://openrouter.ai/api/frontend/stats/model-activity";

const FRONTEND_MODELS_URL = "https://openrouter.ai/api/frontend/models";

interface RawRecord {
  date: string;
  count?: number;
  total_prompt_tokens?: number;
  total_completion_tokens?: number;
}

// ─── Model discovery (competitor pool) ──────────────

export interface DiscoveredOpenRouterModel {
  permaslug: string; // versioned slug used by model-activity endpoint
  slug: string;
  display_name: string;
  author: string;
  provider: string | null;
}

// Exclude image/video/audio/asr/omni models by name (modality check below is
// the primary filter; this catches name-only signals).
const EXCLUDE_NAME_RE = /(image|video|kling|seedance|audio|tts|asr|omni)/i;

/**
 * Discover current OpenRouter models for the given author slugs.
 *
 * Uses the frontend models catalog (which exposes `permaslug`, `author`, and
 * modality fields). Keeps only non-hidden text-output models (so text/code/VL
 * stay, while image/video/audio/asr/embedding are dropped) that don't match the
 * exclusion name pattern.
 */
export async function discoverOpenRouterModels(
  authors: string[]
): Promise<DiscoveredOpenRouterModel[]> {
  const authorSet = new Set(authors);
  const headers: Record<string, string> = {
    "User-Agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
    Accept: "application/json",
  };

  const res = await fetch(FRONTEND_MODELS_URL, {
    headers,
    signal: AbortSignal.timeout(45_000),
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  }
  const json = await res.json();
  const arr: Array<Record<string, unknown>> = json?.data ?? [];

  const out: DiscoveredOpenRouterModel[] = [];
  for (const m of arr) {
    const author = m.author as string | undefined;
    const permaslug = m.permaslug as string | undefined;
    const slug = (m.slug as string) ?? "";
    if (!author || !authorSet.has(author)) continue;
    if (m.hidden === true) continue;
    if (m.has_text_output !== true) continue; // drops image/video/audio/embedding
    if (!permaslug) continue;
    const name = (m.name as string) ?? (m.short_name as string) ?? slug;
    if (EXCLUDE_NAME_RE.test(`${slug} ${name}`)) continue;

    out.push({
      permaslug,
      slug,
      display_name: name,
      author,
      provider: (m.author_display_name as string) ?? null,
    });
  }
  return out;
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
