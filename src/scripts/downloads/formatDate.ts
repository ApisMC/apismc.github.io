/** Formats an ISO date string using the active page locale. */
export function formatDate(iso: string): string {
  if (!iso) return "-";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const isUk =
    typeof document !== "undefined" && document.documentElement.lang.toLowerCase().startsWith("uk");
  return new Intl.DateTimeFormat(isUk ? "uk-UA" : "en-US", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}
