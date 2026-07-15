// The one badge component used everywhere a simulated evidence,
// campaign, finding, or activity line renders — a new screen inherits
// this label by rendering the same row component, not because someone
// remembered to add it. Deliberately has no prop to hide it: "no
// suppression control exists anywhere in the product" (Platform
// Contract §02) is satisfied by this control not existing, not by it
// existing-but-restricted.
export function SimulatedBadge({ size = "sm" }: { size?: "sm" | "xs" }) {
  const padding = size === "xs" ? "px-1.5 py-0.5 text-[9px]" : "px-2 py-0.5 text-[10px]";
  return (
    <span
      className={`inline-flex items-center gap-1 font-bold uppercase tracking-wide rounded border border-[#D7B87A]/40 ${padding}`}
      style={{ background: "#0B1929", color: "#D7B87A" }}
    >
      Simulated
    </span>
  );
}
