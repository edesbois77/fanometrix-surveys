// Shared "how long ago" formatter — Today / Yesterday / N days ago, falling
// back to an absolute date beyond a week. Used by the Research Project
// Workspace's hero ("Last Updated"), Evidence card ("Last Updated"), and
// the Activity timeline's day grouping, so all three read the same way.
export function formatRelativeTime(iso: string | null): string {
  if (!iso) return "—";
  const then = new Date(iso);
  const now = new Date();

  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dayDiff = Math.round((startOfDay(now).getTime() - startOfDay(then).getTime()) / 86_400_000);

  if (dayDiff === 0) {
    const minuteDiff = Math.round((now.getTime() - then.getTime()) / 60_000);
    if (minuteDiff < 1) return "Just now";
    if (minuteDiff < 60) return `${minuteDiff} minute${minuteDiff !== 1 ? "s" : ""} ago`;
    const hourDiff = Math.round(minuteDiff / 60);
    return `${hourDiff} hour${hourDiff !== 1 ? "s" : ""} ago`;
  }
  if (dayDiff === 1) return "Yesterday";
  if (dayDiff > 1 && dayDiff <= 7) return `${dayDiff} days ago`;

  return then.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

/** Just the day label ("Today" / "Yesterday" / absolute date) — used to group Activity entries. */
export function formatRelativeDay(iso: string): string {
  const then = new Date(iso);
  const now = new Date();
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dayDiff = Math.round((startOfDay(now).getTime() - startOfDay(then).getTime()) / 86_400_000);

  if (dayDiff === 0) return "Today";
  if (dayDiff === 1) return "Yesterday";
  return then.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}
