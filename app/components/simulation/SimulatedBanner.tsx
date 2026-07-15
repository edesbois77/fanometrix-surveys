// Permanent, non-dismissible — no close button, no collapsed state, no
// local-storage "don't show again." Rendered once, at the top of the
// Workspace, whenever research_mode === 'simulated'. Styled in-brand
// (gold on navy, the same palette every other Fanometrix surface uses)
// so it reads as methodology, not a warning banner.
export function SimulatedBanner() {
  return (
    <div
      role="status"
      className="rounded-xl px-4 py-2.5 flex items-center justify-center gap-2 text-xs font-bold uppercase tracking-wider"
      style={{ background: "#0B1929", color: "#D7B87A" }}
    >
      <span aria-hidden className="text-[8px]">●</span>
      Simulated Research, Synthetic Data Only
    </div>
  );
}
