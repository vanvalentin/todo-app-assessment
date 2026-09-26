const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Compact editorial timestamps used by board cards and roster rows.
 * Days are rendered in the viewer's own timezone; instants stay UTC on the wire.
 */
export function formatRelativeTime(isoTimestamp: string, now: Date = new Date()): string {
  const timestamp = new Date(isoTimestamp);
  const elapsedMs = now.getTime() - timestamp.getTime();
  if (Number.isNaN(timestamp.getTime())) return "unknown";
  if (elapsedMs < 60_000) return "just now";

  const minutes = Math.floor(elapsedMs / 60_000);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(elapsedMs / DAY_MS);
  if (days < 1) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days}d ago`;

  return formatDate(isoTimestamp);
}

export function formatDate(isoTimestamp: string): string {
  const timestamp = new Date(isoTimestamp);
  if (Number.isNaN(timestamp.getTime())) return "unknown";
  return new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(timestamp);
}

/** "in 6 days" / "in 3 hours" for invitation expiry, based on the same clock as the UI. */
export function formatExpiry(isoTimestamp: string, now: Date = new Date()): string {
  const remainingMs = new Date(isoTimestamp).getTime() - now.getTime();
  if (Number.isNaN(remainingMs)) return "unknown";
  if (remainingMs <= 0) return "expired";

  const hours = Math.ceil(remainingMs / (60 * 60 * 1000));
  if (hours <= 1) return "in under an hour";
  if (hours < 48) return `in ${hours} hours`;
  return `in ${Math.ceil(hours / 24)} days`;
}
