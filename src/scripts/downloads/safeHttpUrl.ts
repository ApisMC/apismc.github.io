/** Validates that a URL uses HTTP or HTTPS before attaching it to an anchor element. */
export function safeHttpUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:"
      ? parsed.toString()
      : null;
  } catch {
    return null;
  }
}
