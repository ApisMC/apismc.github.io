/** Strips trailing slashes and worker route suffixes from the configured API base URL. */
export function normalizeBaseUrl(raw: string): string {
  return raw
    .trim()
    .replace(/\/+$/, "")
    .replace(/\/gh\/apis(?:\/info|\/download)?$/, "");
}
