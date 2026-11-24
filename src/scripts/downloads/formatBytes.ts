/** Formats a byte count as MiB or KiB. */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "-";
  const mib = bytes / (1024 * 1024);
  return mib >= 1 ? `${mib.toFixed(1)} MiB` : `${(bytes / 1024).toFixed(0)} KiB`;
}
