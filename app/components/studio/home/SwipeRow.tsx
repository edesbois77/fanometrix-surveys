"use client";

// ── SwipeRow — the Fanometrix browseable-collection pattern ──────────────────
// Blueprint rule: browseable card collections use horizontal SWIPE on mobile
// rather than stacking every card vertically; on wider screens they become a
// grid. Native scroll-snap only — no carousel dependency. On mobile the row
// bleeds to the screen edges (so a card peeks past the gutter, signalling "more
// this way"); at md+ it becomes a normal grid inside the content column.

export function SwipeRow({
  children, mdCols = 3,
}: {
  children: React.ReactNode;
  /** Columns from md up (2 or 3). */
  mdCols?: 2 | 3;
}) {
  const gridCols = mdCols === 2 ? "md:grid-cols-2" : "md:grid-cols-2 lg:grid-cols-3";
  return (
    <div
      className={`flex md:grid ${gridCols} gap-4 overflow-x-auto md:overflow-visible snap-x snap-mandatory no-scrollbar -mx-4 px-4 sm:-mx-6 sm:px-6 md:mx-0 md:px-0 pb-1`}
      style={{ scrollPaddingLeft: "1rem" }}
    >
      {children}
    </div>
  );
}

// Each direct child of SwipeRow wraps in this so it snaps and sizes correctly:
// ~82% width on mobile (the next card peeks), full grid cell at md+.
export function SwipeItem({ children }: { children: React.ReactNode }) {
  return (
    <div className="snap-start shrink-0 w-[82%] sm:w-[46%] md:w-auto">
      {children}
    </div>
  );
}
