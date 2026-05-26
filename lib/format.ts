/**
 * Number formatting utilities.
 * Uses Intl.NumberFormat as specified in SPEC.
 */

export function formatTokens(n: number): string {
  if (n >= 1_000_000_000) {
    return `${(n / 1e9).toFixed(1)}B`;
  }
  if (n >= 1_000_000) {
    return `${(n / 1e6).toFixed(1)}M`;
  }
  if (n >= 1_000) {
    return `${(n / 1e3).toFixed(1)}K`;
  }
  return new Intl.NumberFormat("en-US").format(n);
}

export function formatRequests(n: number): string {
  return new Intl.NumberFormat("en-US").format(n);
}
